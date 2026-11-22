import { type Item } from "./item.ts";
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
export declare const pairKeyOf: (idA: string, idB: string) => string;
/** The orientation a verdict must be multiplied by, since it is stored relative to the key. */
export declare const flipOfIds: (idA: string, idB: string) => 1 | -1;
/** A verdict re-oriented by `sign` (±1). `|| 0` keeps an equal answer 0 rather than -0. */
export declare const orient: (v: Verdict, sign: number) => Verdict;
/** Lowest priority index among an item's tags — Infinity for the untiered bottom band. */
export declare const tierOf: (it: Pick<Item, "tags"> | undefined, priority: readonly string[]) => number;
export declare const tierName: (t: number, priority: readonly string[]) => string;
/**
 * The synthesised verdict for a cross-tier pair, or null when the pair must be asked:
 * tiers off, same tier, or both untiered. Never logged — recomputed every time, so
 * reordering tiers re-cuts the ranking with nothing stale left behind.
 */
export declare function tierVerdict(a: Pick<Item, "tags">, b: Pick<Item, "tags">, priority: readonly string[]): Verdict | null;
/** Worst-case comparisons for binary insertion on n items. */
export declare function budgetFor(n: number): number;
/**
 * The slots in `out` an item can still land in, from what is already known about it. Every
 * known answer against a placed item is a bound: "after out[k]" (or equal — ties fall after)
 * means lo ≥ k+1, "before out[k]" means hi ≤ k. Binary search only probes midpoints, so
 * without this a known answer is used only when it happens to be the midpoint, and the person
 * is asked pairs with one possible answer. Answers that contradict each other leave no slot;
 * then the whole range is searched, as before, rather than guessing which answer to drop.
 * ponytail: O(placed) lookups per insertion, O(n²) overall — fine at hundreds of items.
 */
export declare function slotsFor(n: number, out: readonly number[], known: (a: number, b: number) => Verdict | null): [lo: number, hi: number];
export interface Progress {
    placed: number[];
    remaining: number[];
    next: number | undefined;
}
export interface Probe {
    out: readonly number[];
    lo: number;
    hi: number;
    mid: number;
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
export declare function sortIndices(arr: readonly number[], cmp: (a: number, b: number) => Verdict | Promise<Verdict>, onProgress?: (p: Progress) => void, onProbe?: (p: Probe) => void, known?: (a: number, b: number) => Verdict | null): Promise<number[]>;
/**
 * Group items joined by a CHAIN of "equal" answers — A = B and B = C share a rank even when
 * A and C were never compared. Returns find(id) → representative.
 */
export declare function tieClasses(items: readonly Item[], log: readonly LogEntry[]): (id: string) => string;
/**
 * Answers the finished ranking disagrees with, by log index. Any cycle (A>B, B>C, C>A)
 * must violate at least one of its own answers once flattened to a line, so this catches
 * inconsistency without building the graph.
 */
export declare function findConflicts(log: readonly LogEntry[], rankById: ReadonlyMap<string, number>): Map<number, string>;
/**
 * Rewrite every logged answer that mentions `oldId` to mention `newId`, flipping the sign
 * when the rename swaps which id sorts first. Mutates `log` (and moves a bench entry).
 */
export declare function migrateId(log: LogEntry[], benched: Set<string> | undefined, oldId: string, newId: string): LogEntry[];
export interface EngineState {
    items: Item[];
    log: LogEntry[];
    benched: Set<string>;
    priority: string[];
    weights: number[];
    combine: Combine;
}
export type EngineInput = Partial<Omit<EngineState, "benched">> & {
    benched?: Iterable<string>;
};
/**
 * Tie the pieces together for one list. `ask(aIdx, bIdx)` is the host's job: show the pair
 * and resolve a {@link Verdict}; reject to abort. A direct answer about a specific pair beats
 * the tier order — the escape hatch for promoting one item across a divide.
 */
export declare function createEngine(input?: EngineInput): {
    state: EngineState;
    live: () => number[];
    budget: () => number;
    answeredCount: () => number;
    /** Run a full sort. Resolves to item indices, best first. */
    run: (ask: (a: number, b: number) => Promise<Verdict> | Verdict, { onProgress, onRecord, onProbe }?: {
        onProgress?: (p: Progress) => void;
        onRecord?: (log: LogEntry[]) => void;
        onProbe?: (p: Probe) => void;
    }) => Promise<number[]>;
    ranking: (order: readonly number[]) => Item[];
    ties: () => (id: string) => string;
    conflicts: (rankById: ReadonlyMap<string, number>) => Map<number, string>;
    migrate: (oldId: string, newId: string) => void;
    /** Serialisable form — the host decides where it goes. */
    toJSON: () => {
        benched: string[];
        items: Item[];
        log: LogEntry[];
        priority: string[];
        weights: number[];
        combine: Combine;
    };
};
export type Engine = ReturnType<typeof createEngine>;
/**
 * The order a set of answers already settles — synchronously, asking nobody. Binary insertion
 * replays the log (and the tiers) and stops at the first pair neither settles: `order` is what
 * got placed, `unplaced` the rest, `next` the pair that would be asked. For code that must be
 * pure and synchronous, like a scheduler, rather than waiting on a person.
 */
export declare function replay(items: readonly Item[], log: readonly LogEntry[], priority?: readonly string[]): {
    order: number[];
    unplaced: number[];
    next: [number, number] | null;
};
/**
 * The log after `ids` leave for good (finished work, say), without anything to re-ask: their
 * answers are dropped, and every pair the order before the removal already settles is filled in
 * as an implied answer, so replaying the rest gives the same order. Ties stay ties. Pairs the old
 * order had not settled (items it had not placed) are left to be asked.
 */
export declare function retireLog(items: readonly Item[], log: readonly LogEntry[], ids: readonly string[], priority?: readonly string[]): LogEntry[];
