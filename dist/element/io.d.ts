import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-io>` — the list as text to edit (default), or with `view="import"` a box to paste an
 * export into. Fires `pairwise-saved` after a save, `pairwise-imported` with the new list and
 * counts, and `pairwise-cancel` from the import view.
 */
export declare class PairwiseIo extends PairwiseElement {
    #private;
    static get observedAttributes(): string[];
    attributeChangedCallback(): void;
    constructor();
    protected styles(): CSSStyleSheet[];
    /**
     * Filter the item lines by title. The box is the input to Save, so it is never filtered in
     * place — a filtered box that got saved would drop every line it hid. Matches show read-only
     * beside it instead, and saving is locked until the filter is cleared.
     */
    get query(): string;
    set query(q: string);
    /** Refill the text from the list, discarding unsaved edits. */
    reset(): void;
    /** Put text in the box with a note — e.g. an export the clipboard refused. */
    show(text: string, note: string): void;
    render(): void;
}
