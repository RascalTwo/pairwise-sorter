// The web components. Importing this module registers every element.
import { PairwiseSorter } from "./app.js";
import { PairwiseBench } from "./bench.js";
import { PairwiseCompare } from "./compare.js";
import { PairwiseConflicts } from "./conflicts.js";
import { PairwiseEditor } from "./editor.js";
import { PairwiseIo } from "./io.js";
import { PairwiseLists } from "./lists.js";
import { PairwiseProgress } from "./progress.js";
import { PairwiseRanking } from "./ranking.js";
import { PairwiseTiers, PairwiseWeights } from "./tiers.js";
export { PairwiseElement, theme } from "./base.js";
// Internal: used by <pairwise-sorter>, registered but not a supported standalone API.
export { PairwiseBench, PairwiseEditor, PairwiseIo, PairwiseLists };
export { PairwiseSorter };
export { installConsole } from "./console.js";
export { PairwiseCompare, PairwiseConflicts, PairwiseProgress, PairwiseRanking, PairwiseTiers, PairwiseWeights };
const define = (tag, cls) => customElements.get(tag) ?? customElements.define(tag, cls);
define("pairwise-bench", PairwiseBench);
define("pairwise-compare", PairwiseCompare);
define("pairwise-conflicts", PairwiseConflicts);
define("pairwise-editor", PairwiseEditor);
define("pairwise-io", PairwiseIo);
define("pairwise-lists", PairwiseLists);
define("pairwise-progress", PairwiseProgress);
define("pairwise-ranking", PairwiseRanking);
define("pairwise-tiers", PairwiseTiers);
define("pairwise-weights", PairwiseWeights);
// Last: its constructor creates the child elements above, so they must already be defined.
define("pairwise-sorter", PairwiseSorter);
//# sourceMappingURL=index.js.map