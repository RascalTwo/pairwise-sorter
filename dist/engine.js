// The ranking engine: the decision log, tiers, the sort, and the analyses derived from a
// finished order. No DOM, no storage.
//
// THE SEAM is `ask`. A comparison is answered from the log first, then from the declared
// tiers, and only reaches the host when it genuinely needs a human.
//
// Two properties a host must not break:
//   * The log is REPLAYABLE. The sort is deterministic, so replaying the log from scratch
//     reconstructs any point — undo, reload and resume all fall out of that.
//   * Identity is never POSITION (see `idOf`). When identity legitimately changes, call
//     `migrateId` — a pair whose two ids swap sides must also flip its recorded sign.
import { idOf, SEP } from "./item.js";
/** Canonical key for an unordered pair: A-vs-B and B-vs-A collide. */
export const pairKeyOf = (idA, idB) => (idA < idB ? idA + SEP + idB : idB + SEP + idA);
/** The orientation a verdict must be multiplied by, since it is stored relative to the key. */
export const flipOfIds = (idA, idB) => (idA < idB ? 1 : -1);
/** A verdict re-oriented by `sign` (±1). `|| 0` keeps an equal answer 0 rather than -0. */
export const orient = (v, sign) => ((v * sign) || 0);
/** Lowest priority index among an item's tags — Infinity for the untiered bottom band. */
export const tierOf = (it, priority) => (it?.tags ?? []).reduce((best, t) => {
    const i = priority.indexOf(t);
    return i >= 0 && i < best ? i : best;
}, Infinity);
export const tierName = (t, priority) => t === Infinity ? "untiered" : "#" + priority[t];
/**
 * The synthesised verdict for a cross-tier pair, or null when the pair must be asked:
 * tiers off, same tier, or both untiered. Never logged — recomputed every time, so
 * reordering tiers re-cuts the ranking with nothing stale left behind.
 */
export function tierVerdict(a, b, priority) {
    if (!priority.length)
        return null;
    const ta = tierOf(a, priority), tb = tierOf(b, priority);
    if (ta === tb)
        return null;
    return ta < tb ? -1 : 1;
}
/** Worst-case comparisons for binary insertion on n items. */
export function budgetFor(n) {
    let t = 0;
    for (let i = 1; i < n; i++)
        t += Math.ceil(Math.log2(i + 1));
    return Math.max(1, t);
}
/**
 * The slots in `out` an item can still land in, from what is already known about it. Every
 * known answer against a placed item is a bound: "after out[k]" (or equal — ties fall after)
 * means lo ≥ k+1, "before out[k]" means hi ≤ k. Binary search only probes midpoints, so
 * without this a known answer is used only when it happens to be the midpoint, and the person
 * is asked pairs with one possible answer. Answers that contradict each other leave no slot;
 * then the whole range is searched, as before, rather than guessing which answer to drop.
 * ponytail: O(placed) lookups per insertion, O(n²) overall — fine at hundreds of items.
 */
export function slotsFor(n, out, known) {
    let lo = 0, hi = out.length;
    out.forEach((o, k) => {
        const v = known(n, o);
        if (v === null)
            return;
        if (v < 0)
            hi = Math.min(hi, k);
        else
            lo = Math.max(lo, k + 1);
    });
    return lo <= hi ? [lo, hi] : [0, out.length];
}
/**
 * Binary insertion sort over indices, asking `cmp` for each probe.
 *
 * Binary insertion rather than merge sort because it is append-stable: appending an item
 * leaves every earlier insertion identical, so those comparisons replay from the log and
 * only the newcomer costs questions (~log2 n). It is also cheaper overall.
 *
 * `onProbe` exposes the search state before each comparison: from any probe only TWO
 * slots can be asked next, so a host can warm exactly those.
 *
 * `known` answers a pair without asking, or null; it narrows the search first (`slotsFor`).
 */
export async function sortIndices(arr, cmp, onProgress, onProbe, known = () => null) {
    const out = [];
    for (let n = 0; n < arr.length; n++) {
        onProgress?.({ placed: [...out], remaining: arr.slice(n), next: arr[n + 1] });
        let [lo, hi] = slotsFor(arr[n], out, known);
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            onProbe?.({ out, lo, hi, mid });
            const v = await cmp(arr[n], out[mid]);
            if (v < 0)
                hi = mid;
            else
                lo = mid + 1; // ties fall after, keeping order stable
        }
        out.splice(lo, 0, arr[n]);
    }
    return out;
}
/**
 * Group items joined by a CHAIN of "equal" answers — A = B and B = C share a rank even when
 * A and C were never compared. Returns find(id) → representative.
 */
export function tieClasses(items, log) {
    const parent = new Map(items.map((it) => [idOf(it), idOf(it)]));
    const find = (x) => {
        while (parent.has(x) && parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)));
            x = parent.get(x);
        }
        return x;
    };
    for (const [k, v] of log) {
        if (v !== 0)
            continue;
        const [a = "", b = ""] = k.split(SEP);
        if (!parent.has(a) || !parent.has(b))
            continue;
        const ra = find(a), rb = find(b);
        if (ra !== rb)
            parent.set(ra, rb);
    }
    return find;
}
/**
 * Answers the finished ranking disagrees with, by log index. Any cycle (A>B, B>C, C>A)
 * must violate at least one of its own answers once flattened to a line, so this catches
 * inconsistency without building the graph.
 */
export function findConflicts(log, rankById) {
    const bad = new Map();
    log.forEach(([k, v], n) => {
        const [x = "", y = ""] = k.split(SEP);
        const rx = rankById.get(x), ry = rankById.get(y);
        if (rx === undefined || ry === undefined)
            return;
        if (v === 0) {
            if (rx !== ry)
                bad.set(n, "you called these equal, but they ranked apart");
        }
        else {
            const [win, lose] = v < 0 ? [rx, ry] : [ry, rx];
            if (win >= lose)
                bad.set(n, "this answer disagrees with the final ranking");
        }
    });
    return bad;
}
/**
 * Rewrite every logged answer that mentions `oldId` to mention `newId`, flipping the sign
 * when the rename swaps which id sorts first. Mutates `log` (and moves a bench entry).
 */
export function migrateId(log, benched, oldId, newId) {
    if (oldId === newId)
        return log;
    const out = log.map(([k, v, ...implied]) => {
        const [x = "", y = ""] = k.split(SEP);
        if (x !== oldId && y !== oldId)
            return [k, v, ...implied];
        const nx = x === oldId ? newId : x, ny = y === oldId ? newId : y;
        return nx < ny ? [nx + SEP + ny, v, ...implied] : [ny + SEP + nx, orient(v, -1), ...implied];
    });
    log.length = 0;
    log.push(...out);
    if (benched?.delete(oldId))
        benched.add(newId);
    return log;
}
/**
 * Tie the pieces together for one list. `ask(aIdx, bIdx)` is the host's job: show the pair
 * and resolve a {@link Verdict}; reject to abort. A direct answer about a specific pair beats
 * the tier order — the escape hatch for promoting one item across a divide.
 */
export function createEngine(input = {}) {
    const s = {
        items: input.items ?? [], log: input.log ?? [], benched: new Set(input.benched ?? []),
        priority: input.priority ?? [], weights: input.weights ?? [], combine: input.combine ?? "order",
    };
    const answers = new Map(s.log.map(([k, v]) => [k, v]));
    const live = () => s.items.map((_, i) => i).filter((i) => !s.benched.has(idOf(s.items[i])));
    /** A pair's answer from the log, else the tiers, else null — no one is asked. */
    const known = (a, b) => {
        const ia = idOf(s.items[a]), ib = idOf(s.items[b]);
        const v = answers.get(pairKeyOf(ia, ib));
        return v !== undefined ? orient(v, flipOfIds(ia, ib)) : tierVerdict(s.items[a], s.items[b], s.priority);
    };
    async function cmp(a, b, ask, onRecord) {
        const settled = known(a, b);
        if (settled !== null)
            return settled;
        const ia = idOf(s.items[a]), ib = idOf(s.items[b]);
        const k = pairKeyOf(ia, ib), flip = flipOfIds(ia, ib);
        const v = await ask(a, b);
        answers.set(k, orient(v, flip));
        s.log.push([k, orient(v, flip)]);
        onRecord?.(s.log);
        return v;
    }
    return {
        state: s,
        live,
        budget: () => budgetFor(live().length),
        answeredCount: () => s.log.length,
        /** Run a full sort. Resolves to item indices, best first. */
        run: (ask, { onProgress, onRecord, onProbe } = {}) => sortIndices(live(), (a, b) => cmp(a, b, ask, onRecord), onProgress, onProbe, known),
        ranking: (order) => order.map((i) => s.items[i]),
        ties: () => tieClasses(s.items, s.log),
        conflicts: (rankById) => findConflicts(s.log, rankById),
        migrate: (oldId, newId) => {
            migrateId(s.log, s.benched, oldId, newId);
            answers.clear();
            for (const [k, v] of s.log)
                answers.set(k, v);
        },
        /** Serialisable form — the host decides where it goes. */
        toJSON: () => ({ ...s, benched: [...s.benched] }),
    };
}
/**
 * The order a set of answers already settles — synchronously, asking nobody. Binary insertion
 * replays the log (and the tiers) and stops at the first pair neither settles: `order` is what
 * got placed, `unplaced` the rest, `next` the pair that would be asked. For code that must be
 * pure and synchronous, like a scheduler, rather than waiting on a person.
 */
export function replay(items, log, priority = []) {
    const answers = new Map(log.map(([k, v]) => [k, v]));
    const settled = (a, b) => {
        const ia = idOf(items[a]), ib = idOf(items[b]);
        const known = answers.get(pairKeyOf(ia, ib));
        if (known !== undefined)
            return orient(known, flipOfIds(ia, ib));
        return tierVerdict(items[a], items[b], priority);
    };
    const order = [];
    for (let n = 0; n < items.length; n++) {
        let [lo, hi] = slotsFor(n, order, settled);
        while (lo < hi) {
            const mid = (lo + hi) >> 1, v = settled(n, order[mid]);
            if (v === null)
                return { order, unplaced: items.map((_, i) => i).slice(n), next: [n, order[mid]] };
            if (v < 0)
                hi = mid;
            else
                lo = mid + 1;
        }
        order.splice(lo, 0, n);
    }
    return { order, unplaced: [], next: null };
}
/**
 * The log after `ids` leave for good (finished work, say), without anything to re-ask: their
 * answers are dropped, and every pair the order before the removal already settles is filled in
 * as an implied answer, so replaying the rest gives the same order. Ties stay ties. Pairs the old
 * order had not settled (items it had not placed) are left to be asked.
 */
export function retireLog(items, log, ids, priority = []) {
    if (!ids.length)
        return [...log];
    const before = replay(items, log, priority);
    const pos = new Map(before.order.map((i, n) => [idOf(items[i]), n]));
    const tie = tieClasses(items, log);
    const gone = new Set(ids);
    const rest = items.filter((it) => !gone.has(idOf(it)));
    const out = log.filter(([k]) => !k.split(SEP).some((id) => gone.has(id)));
    // Replay the survivors, answering each unsettled pair from the old order while it can.
    let next = replay(rest, out, priority).next;
    while (next) {
        const ia = idOf(rest[next[0]]), ib = idOf(rest[next[1]]);
        const pa = pos.get(ia), pb = pos.get(ib);
        if (pa === undefined || pb === undefined)
            break;
        const v = tie(ia) === tie(ib) ? 0 : pa < pb ? -1 : 1;
        out.push([pairKeyOf(ia, ib), orient(v, flipOfIds(ia, ib)), true]);
        next = replay(rest, out, priority).next;
    }
    return out;
}
//# sourceMappingURL=engine.js.map