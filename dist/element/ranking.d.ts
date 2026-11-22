import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-ranking>` — the ranking, best first: shared ranks for ties, tier rules, rows that
 * expand to show media and description, a title filter, and bench / edit / open actions per row.
 * Mid-sort it shows the placed part as provisional and lists the rest. Set `query`, or call
 * `expand()` / `expandAll()` / `collapseAll()`, from code; `no-search` hides its own search box.
 * Fires `pairwise-edit` and `pairwise-benched`.
 */
export declare class PairwiseRanking extends PairwiseElement {
    #private;
    constructor();
    protected styles(): CSSStyleSheet[];
    static get observedAttributes(): string[];
    attributeChangedCallback(): void;
    /** The title filter. Display only: it hides rows, never changes a rank. */
    get query(): string;
    set query(q: string);
    /** Open (or close) the detail row of `list.items[index]`. */
    expand(index: number, on?: boolean): void;
    /** Open every row that has media or a description. */
    expandAll(): void;
    collapseAll(): void;
    render(): void;
}
