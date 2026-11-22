import type { Library } from "../store.ts";
import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-lists>` — pick, name, create, import and delete lists. A view only: it shows
 * `.library` and fires `pairwise-list-open` {id}, `pairwise-list-new`, `pairwise-list-rename`
 * {name}, `pairwise-list-delete` and `pairwise-import` for the host to act on.
 */
export declare class PairwiseLists extends PairwiseElement {
    #private;
    /** How long an armed Delete waits for its second click, in ms. */
    disarmAfter: number;
    constructor();
    protected styles(): CSSStyleSheet[];
    /** The lists to show. */
    set library(lib: Library | null);
    render(): void;
}
