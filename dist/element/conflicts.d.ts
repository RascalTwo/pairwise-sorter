import type { Sorter } from "../sorter.ts";
import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-conflicts>` — every answer you gave, newest last, each deletable; answers filled in
 * by `retire` are labelled "implied". Answers the
 * ranking contradicts are flagged; Resolve reorders to contradict as few as possible.
 */
export declare class PairwiseConflicts extends PairwiseElement {
    #private;
    /** Show only answers naming an item whose title contains this. Display only. */
    get query(): string;
    set query(q: string);
    constructor();
    protected styles(): CSSStyleSheet[];
    protected listen(s: Sorter, signal: AbortSignal): void;
    render(): void;
    /** Reorder to contradict as few answers as possible; returns (and shows) what happened. */
    resolve(): string;
}
