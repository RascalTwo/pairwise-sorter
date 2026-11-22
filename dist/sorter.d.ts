import { type RankRow } from "./analysis.ts";
import { type Combine, type Verdict } from "./engine.ts";
import { type Item } from "./item.ts";
import { type List } from "./store.ts";
/** A pair being asked: indices into `list.items`, shown as left (`a`) and right (`b`). */
export interface Question {
    a: number;
    b: number;
}
export interface Comparison {
    index: number;
    a: {
        title: string;
        url: string;
    };
    b: {
        title: string;
        url: string;
    };
    verdict: Verdict;
    /** Filled in from an earlier order by `retire`, not given by a person. */
    implied: boolean;
    /** Why the ranking contradicts this answer, or null when it does not. */
    why: string | null;
}
export type Tier = string | {
    tag?: string;
    name?: string;
    weight?: number;
};
/**
 * Events: `question` (a new pair is waiting), `change` (the list changed — save it),
 * `done` (a complete ranking is ready), `upcoming` (detail: item indices that may be asked
 * next, for preloading their media).
 */
export declare class Sorter extends EventTarget {
    #private;
    /** The open list. Mutated in place; save it on `change`. */
    list: List;
    /** The pair waiting for an answer, or null. */
    question: Question | null;
    constructor(list?: List);
    /** Switch to a list, abandoning any sort in progress. Malformed saved answers are dropped. */
    open(list: List): void;
    /** Resolves once the sorter is waiting on a question or has finished. */
    settled(): Promise<void>;
    /** True once a full ranking exists and nothing is being asked. */
    get complete(): boolean;
    /** Answer the open question: -1 left wins, 1 right wins, 0 equal. Resolves when settled. */
    answer(v: Verdict): Promise<void>;
    /** Drop the most recent answer; its question comes back. */
    undo(): Promise<void>;
    /** Forget one answer by its index in {@link comparisons}. */
    deleteAnswer(i: number): Promise<void>;
    /** Clear every answer. Items and the bench are untouched. */
    resetAnswers(): Promise<void>;
    /** Take items out of the ranking. Their answers are kept. */
    bench(ids: readonly string[]): Promise<void>;
    /** Put a benched item back; its kept answers restore its place. */
    subIn(id: string): Promise<void>;
    subAll(): Promise<void>;
    /**
     * Remove items for good — finished work, say — WITHOUT re-asking anything. An item that others
     * were compared against instead of each other takes those links with it, so replaying would
     * need new questions; but the order before the removal already settles every pair among the
     * items it had placed. Those questions are answered from it and logged as implied (ties stay
     * ties). Items it had not placed yet are still asked about for real.
     */
    retire(ids: readonly string[]): Promise<void>;
    /** Benched items that still exist. */
    benchedItems(): Item[];
    /**
     * Replace the items. Survivors keep their EXISTING order and new items append — that
     * append-stability is what lets every earlier answer replay, so adding one item costs
     * ~log2 n questions. Only deleted items lose their answers.
     */
    setItems(next: readonly Item[]): {
        dupes: string[];
        dropped: number;
    };
    /**
     * Change an item's fields. A rename CARRIES its answers across (see `migrateId`); a rename
     * onto another existing item would merge two histories, so it is refused.
     */
    editItem(index: number, patch: Partial<Omit<Item, "key">>): Promise<void>;
    /** Every tag on any item, sorted. */
    tags(): string[];
    /**
     * Set the tiers, best first — tags or `{tag, weight}`. Cross-tier pairs are then answered from
     * this order instead of being asked. `[]` turns tiers off.
     */
    setPriority(tiers: readonly Tier[]): Promise<void>;
    /** "order": a higher tier wins outright · "weights": tiers contribute in proportion. */
    setCombine(mode: Combine): Promise<void>;
    /** Your answers that go against the tier order. Yours win until dropped. */
    overrides(): Comparison[];
    /** Forget the answers that go against the tiers, letting the tiers decide those pairs. */
    dropOverrides(): Promise<void>;
    /** Indices of items in the ranking (not benched). */
    live(): number[];
    /** Worst-case questions for the whole sort, honest about tiers. */
    budget(): number;
    /** How much of the ranking is already final. */
    placement(): {
        placed: number;
        total: number;
        pct: number;
    };
    /** The ranking with shared ranks for ties — final once {@link complete}, else the placed part. */
    ranking(): (RankRow & {
        item: Item;
    })[];
    /** Items with no position yet while a sort is running — empty once complete. */
    unplaced(): Item[];
    /** Every answer given, as readable pairs; `why` is set when the ranking contradicts it. */
    comparisons(): Comparison[];
    /**
     * Reorder to contradict as few answers as possible (best-effort local search, not a proof
     * of the minimum). Lasts until the next change re-runs the sort.
     */
    resolve(): {
        before: number;
        after: number;
    };
}
