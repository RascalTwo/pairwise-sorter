// The web components. Importing this module registers every element.
import { PairwiseCompare } from "./compare.ts";
import { PairwiseConflicts } from "./conflicts.ts";
import { PairwiseProgress } from "./progress.ts";
import { PairwiseRanking } from "./ranking.ts";

export { PairwiseElement, theme } from "./base.ts";
export { PairwiseCompare, PairwiseConflicts, PairwiseProgress, PairwiseRanking };

const define = (tag: string, cls: CustomElementConstructor) => customElements.get(tag) ?? customElements.define(tag, cls);
define("pairwise-compare", PairwiseCompare);
define("pairwise-conflicts", PairwiseConflicts);
define("pairwise-progress", PairwiseProgress);
define("pairwise-ranking", PairwiseRanking);

declare global {
  interface HTMLElementTagNameMap {
    "pairwise-compare": PairwiseCompare;
    "pairwise-conflicts": PairwiseConflicts;
    "pairwise-progress": PairwiseProgress;
    "pairwise-ranking": PairwiseRanking;
  }
}
