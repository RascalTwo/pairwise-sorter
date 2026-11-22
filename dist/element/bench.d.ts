import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-bench>` — items taken out of the ranking. "Benched", not "removed": each keeps its
 * answers and is one click from coming back. Fires `pairwise-edit` with `{index}`.
 */
export declare class PairwiseBench extends PairwiseElement {
    #private;
    /** Show only benched items whose title contains this. Display only. */
    get query(): string;
    set query(q: string);
    constructor();
    protected styles(): CSSStyleSheet[];
    render(): void;
}
