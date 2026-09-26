// The web components. Importing this module registers every element.
import { PairwiseBench } from "./bench.ts";
import { PairwiseCompare } from "./compare.ts";
import { PairwiseConflicts } from "./conflicts.ts";
import { PairwiseEditor } from "./editor.ts";
import { PairwiseProgress } from "./progress.ts";
import { PairwiseRanking } from "./ranking.ts";
import { PairwiseTiers, PairwiseWeights } from "./tiers.ts";

export { PairwiseElement, theme } from "./base.ts";
// Internal: used by <pairwise-sorter>, registered but not a supported standalone API.
export { PairwiseBench, PairwiseEditor };
export { PairwiseCompare, PairwiseConflicts, PairwiseProgress, PairwiseRanking, PairwiseTiers, PairwiseWeights };

const define = (tag: string, cls: CustomElementConstructor) => customElements.get(tag) ?? customElements.define(tag, cls);
define("pairwise-bench", PairwiseBench);
define("pairwise-compare", PairwiseCompare);
define("pairwise-conflicts", PairwiseConflicts);
define("pairwise-editor", PairwiseEditor);
define("pairwise-progress", PairwiseProgress);
define("pairwise-ranking", PairwiseRanking);
define("pairwise-tiers", PairwiseTiers);
define("pairwise-weights", PairwiseWeights);

declare global {
  interface HTMLElementTagNameMap {
    "pairwise-bench": PairwiseBench;
    "pairwise-compare": PairwiseCompare;
    "pairwise-conflicts": PairwiseConflicts;
    "pairwise-editor": PairwiseEditor;
    "pairwise-progress": PairwiseProgress;
    "pairwise-ranking": PairwiseRanking;
    "pairwise-tiers": PairwiseTiers;
    "pairwise-weights": PairwiseWeights;
  }
}
