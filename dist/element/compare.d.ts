import { type Item } from "../item.ts";
import type { Sorter } from "../sorter.ts";
import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-compare>` — the question being asked: two cards, Choose buttons and Equal.
 * Keys ← / → choose, ↓ or = means equal, Backspace undoes (turn off with `no-keyboard`); a key
 * another handler already prevented is left alone.
 * Images open in a lightbox instead of voting. Set `renderItem(item, box)` to draw items
 * yourself. Fires `pairwise-edit` with `{index}` when an item's edit button is pressed.
 */
export declare class PairwiseCompare extends PairwiseElement {
    #private;
    /** Draw an item into its card instead of the default title, media, description and tags. */
    renderItem?: (item: Item, box: HTMLElement) => void;
    constructor();
    protected styles(): CSSStyleSheet[];
    protected listen(s: Sorter, signal: AbortSignal): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    render(): void;
}
