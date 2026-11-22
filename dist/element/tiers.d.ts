import { PairwiseElement } from "./base.ts";
/**
 * `<pairwise-tiers>` — the tier order. Tags listed here become tiers: anything in a higher tier
 * outranks anything lower without being asked. Add, reorder and remove tiers, and drop your own
 * answers that go against them.
 */
export declare class PairwiseTiers extends PairwiseElement {
    #private;
    constructor();
    protected styles(): CSSStyleSheet[];
    render(): void;
}
/**
 * `<pairwise-weights>` — how tiers combine. Strict order: a higher tier always wins. Weights:
 * each tier contributes in proportion, so a lower tier's best item can outrank a higher tier's worst.
 */
export declare class PairwiseWeights extends PairwiseElement {
    constructor();
    protected styles(): CSSStyleSheet[];
    render(): void;
}
