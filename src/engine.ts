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

import { idOf, SEP, type Item } from "./item.ts";

/** -1: the first item wins · 1: the second wins · 0: equal. */
export type Verdict = -1 | 0 | 1;
/**
 * One answer: a canonical pair key, the verdict relative to the key's sorted order, and —
 * when the answer was filled in from an earlier order rather than given (see `Sorter.retire`) —
 * `true`, so "what you actually said" stays distinguishable.
 */
export type LogEntry = [key: string, verdict: Verdict, implied?: true];
/** How tiers combine: strictly by order, or scored by weight. */
export type Combine = "order" | "weights";

/** Canonical key for an unordered pair: A-vs-B and B-vs-A collide. */
export const pairKeyOf = (idA: string, idB: string): string => (idA < idB ? idA + SEP + idB : idB + SEP + idA);
/** The orientation a verdict must be multiplied by, since it is stored relative to the key. */
export const flipOfIds = (idA: string, idB: string): 1 | -1 => (idA < idB ? 1 : -1);

/** A verdict re-oriented by `sign` (±1). `|| 0` keeps an equal answer 0 rather than -0. */
export const orient = (v: Verdict, sign: number): Verdict => ((v * sign) || 0) as Verdict;

/** Lowest priority index among an item's tags — Infinity for the untiered bottom band. */
export const tierOf = (it: Pick<Item, "tags"> | undefined, priority: readonly string[]): number =>
  (it?.tags ?? []).reduce((best, t) => {
    const i = priority.indexOf(t);
    return i >= 0 && i < best ? i : best;
  }, Infinity);

export const tierName = (t: number, priority: readonly string[]): string =>
  t === Infinity ? "untiered" : "#" + priority[t];

/**
 * The synthesised verdict for a cross-tier pair, or null when the pair must be asked:
 * tiers off, same tier, or both untiered. Never logged — recomputed every time, so
 * reordering tiers re-cuts the ranking with nothing stale left behind.
 */
export function tierVerdict(a: Pick<Item, "tags">, b: Pick<Item, "tags">, priority: readonly string[]): Verdict | null {
  if (!priority.length) return null;
  const ta = tierOf(a, priority), tb = tierOf(b, priority);
  if (ta === tb) return null;
  return ta < tb ? -1 : 1;
}

/** Worst-case comparisons for binary insertion on n items. */
export function budgetFor(n: number): number {
  let t = 0;
  for (let i = 1; i < n; i++) t += Math.ceil(Math.log2(i + 1));
  return Math.max(1, t);
}

export interface Progress { placed: number[]; remaining: number[]; next: number | undefined }
export interface Probe { out: readonly number[]; lo: number; hi: number; mid: number }

/**
 * Binary insertion sort over indices, asking `cmp` for each probe.
 *
 * Binary insertion rather than merge sort because it is append-stable: appending an item
 * leaves every earlier insertion identical, so those comparisons replay from the log and
 * only the newcomer costs questions (~log2 n). It is also cheaper overall.
 *
 * `onProbe` exposes the search state before each comparison: from any probe only TWO
 * slots can be asked next, so a host can warm exactly those.
 */
export async function sortIndices(
  arr: readonly number[],
  cmp: (a: number, b: number) => Verdict | Promise<Verdict>,
  onProgress?: (p: Progress) => void,
  onProbe?: (p: Probe) => void,
): Promise<number[]> {
  const out: number[] = [];
  for (let n = 0; n < arr.length; n++) {
    onProgress?.({ placed: [...out], remaining: arr.slice(n), next: arr[n + 1] });
    let lo = 0, hi = out.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      onProbe?.({ out, lo, hi, mid });
      const v = await cmp(arr[n]!, out[mid]!);
      if (v < 0) hi = mid; else lo = mid + 1; // ties fall after, keeping order stable
    }
    out.splice(lo, 0, arr[n]!);
  }
  return out;
}

/**
 * Group items joined by a CHAIN of "equal" answers — A = B and B = C share a rank even when
 * A and C were never compared. Returns find(id) → representative.
 */
export function tieClasses(items: readonly Item[], log: readonly LogEntry[]): (id: string) => string {
  const parent = new Map(items.map((it) => [idOf(it), idOf(it)]));
  const find = (x: string): string => {
    while (parent.has(x) && parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const [k, v] of log) {
    if (v !== 0) continue;
    const [a = "", b = ""] = k.split(SEP);
    if (!parent.has(a) || !parent.has(b)) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return find;
}

/**
 * Answers the finished ranking disagrees with, by log index. Any cycle (A>B, B>C, C>A)
 * must violate at least one of its own answers once flattened to a line, so this catches
 * inconsistency without building the graph.
 */
export function findConflicts(log: readonly LogEntry[], rankById: ReadonlyMap<string, number>): Map<number, string> {
  const bad = new Map<number, string>();
  log.forEach(([k, v], n) => {
    const [x = "", y = ""] = k.split(SEP);
    const rx = rankById.get(x), ry = rankById.get(y);
    if (rx === undefined || ry === undefined) return;
    if (v === 0) {
      if (rx !== ry) bad.set(n, "you called these equal, but they ranked apart");
    } else {
      const [win, lose] = v < 0 ? [rx, ry] : [ry, rx];
      if (win >= lose) bad.set(n, "this answer disagrees with the final ranking");
    }
  });
  return bad;
}

/**
 * Rewrite every logged answer that mentions `oldId` to mention `newId`, flipping the sign
 * when the rename swaps which id sorts first. Mutates `log` (and moves a bench entry).
 */
export function migrateId(log: LogEntry[], benched: Set<string> | undefined, oldId: string, newId: string): LogEntry[] {
  if (oldId === newId) return log;
  const out = log.map(([k, v, ...implied]): LogEntry => {
    const [x = "", y = ""] = k.split(SEP);
    if (x !== oldId && y !== oldId) return [k, v, ...implied];
    const nx = x === oldId ? newId : x, ny = y === oldId ? newId : y;
    return nx < ny ? [nx + SEP + ny, v, ...implied] : [ny + SEP + nx, orient(v, -1), ...implied];
  });
  log.length = 0;
  log.push(...out);
  if (benched?.delete(oldId)) benched.add(newId);
  return log;
}

export interface EngineState {
  items: Item[];
  log: LogEntry[];
  benched: Set<string>;
  priority: string[];
  weights: number[];
  combine: Combine;
}
export type EngineInput = Partial<Omit<EngineState, "benched">> & { benched?: Iterable<string> };

/**
 * Tie the pieces together for one list. `ask(aIdx, bIdx)` is the host's job: show the pair
 * and resolve a {@link Verdict}; reject to abort. A direct answer about a specific pair beats
 * the tier order — the escape hatch for promoting one item across a divide.
 */
export function createEngine(input: EngineInput = {}) {
  const s: EngineState = {
    items: input.items ?? [], log: input.log ?? [], benched: new Set(input.benched ?? []),
    priority: input.priority ?? [], weights: input.weights ?? [], combine: input.combine ?? "order",
  };
  const answers = new Map(s.log.map(([k, v]) => [k, v]));
  const live = () => s.items.map((_, i) => i).filter((i) => !s.benched.has(idOf(s.items[i])));

  async function cmp(a: number, b: number, ask: (a: number, b: number) => Promise<Verdict> | Verdict, onRecord?: (log: LogEntry[]) => void): Promise<Verdict> {
    const ia = idOf(s.items[a]), ib = idOf(s.items[b]);
    const k = pairKeyOf(ia, ib), flip = flipOfIds(ia, ib);
    const known = answers.get(k);
    if (known !== undefined) return orient(known, flip);
    const tier = tierVerdict(s.items[a]!, s.items[b]!, s.priority);
    if (tier !== null) return tier;
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
    run: (
      ask: (a: number, b: number) => Promise<Verdict> | Verdict,
      { onProgress, onRecord, onProbe }: { onProgress?: (p: Progress) => void; onRecord?: (log: LogEntry[]) => void; onProbe?: (p: Probe) => void } = {},
    ) => sortIndices(live(), (a, b) => cmp(a, b, ask, onRecord), onProgress, onProbe),
    ranking: (order: readonly number[]) => order.map((i) => s.items[i]!),
    ties: () => tieClasses(s.items, s.log),
    conflicts: (rankById: ReadonlyMap<string, number>) => findConflicts(s.log, rankById),
    migrate: (oldId: string, newId: string) => {
      migrateId(s.log, s.benched, oldId, newId);
      answers.clear();
      for (const [k, v] of s.log) answers.set(k, v);
    },
    /** Serialisable form — the host decides where it goes. */
    toJSON: () => ({ ...s, benched: [...s.benched] }),
  };
}
export type Engine = ReturnType<typeof createEngine>;
