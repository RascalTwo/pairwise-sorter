import { PairwiseSorter } from "./app.ts";
import { PairwiseBench } from "./bench.ts";
import { PairwiseCompare } from "./compare.ts";
import { PairwiseConflicts } from "./conflicts.ts";
import { PairwiseEditor } from "./editor.ts";
import { PairwiseIo } from "./io.ts";
import { PairwiseLists } from "./lists.ts";
import { PairwiseProgress } from "./progress.ts";
import { PairwiseRanking } from "./ranking.ts";
import { PairwiseTiers, PairwiseWeights } from "./tiers.ts";
export { PairwiseElement, theme } from "./base.ts";
export { PairwiseBench, PairwiseEditor, PairwiseIo, PairwiseLists };
export { PairwiseSorter };
export { installConsole } from "./console.ts";
export type { Screen } from "./app.ts";
export { PairwiseCompare, PairwiseConflicts, PairwiseProgress, PairwiseRanking, PairwiseTiers, PairwiseWeights };
declare global {
    interface HTMLElementTagNameMap {
        "pairwise-bench": PairwiseBench;
        "pairwise-compare": PairwiseCompare;
        "pairwise-conflicts": PairwiseConflicts;
        "pairwise-editor": PairwiseEditor;
        "pairwise-io": PairwiseIo;
        "pairwise-lists": PairwiseLists;
        "pairwise-progress": PairwiseProgress;
        "pairwise-ranking": PairwiseRanking;
        "pairwise-tiers": PairwiseTiers;
        "pairwise-weights": PairwiseWeights;
        "pairwise-sorter": PairwiseSorter;
    }
}
