import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-progress>` — answers given against the worst case, how many items are already
 * placed (placed items are final), and, past halfway, an offer to stop. Fires `pairwise-stop`.
 */
export declare class PairwiseProgress extends PairwiseElement {
    protected styles(): CSSStyleSheet[];
    render(): void;
}
