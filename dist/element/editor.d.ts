import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-editor>` — a dialog editing one item: title, link, description, tags and media.
 * Call `edit(index)` to open it. A rename carries the item's answers across; a rename onto
 * another item is refused.
 */
export declare class PairwiseEditor extends PairwiseElement {
    #private;
    constructor();
    protected styles(): CSSStyleSheet[];
    /** Open the editor on `list.items[index]`. */
    edit(index: number): void;
    render(): void;
}
