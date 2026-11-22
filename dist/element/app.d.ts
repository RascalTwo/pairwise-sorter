import { type ExportPayload, type Library, type List } from "../store.ts";
import { PairwiseElement } from "./base.ts";
/** What the app is showing. */
export type Screen = "setup" | "import" | "compare" | "done";
/**
 * `<pairwise-sorter>` — the whole app: several lists, items as text, the questions, the
 * ranking and the answers, tiers, the bench and an item editor. In memory by default; add
 * `storage-key="…"` to keep it in localStorage, or set `.library` and save on `pairwise-change`.
 */
export declare class PairwiseSorter extends PairwiseElement {
    #private;
    constructor();
    protected styles(): CSSStyleSheet[];
    connectedCallback(): void;
    /** Every list. Setting it opens its current list (or a new one); the host keeps ownership. */
    get library(): Library;
    set library(lib: Library);
    /** What is on screen. */
    get screen(): Screen;
    get paused(): boolean;
    /** The title filter across the ranking, the answers, the bench and the items text. Display only. */
    get query(): string;
    search(query: string): void;
    openList(id: string): void;
    newList(name?: string): string;
    /** Add an existing list (an import, say) and open it. */
    addList(list: List): string;
    renameList(name: string): void;
    deleteList(id: string): void;
    goto(screen: Screen): void;
    /** Leave the question to see the ranking so far. False when nothing is being asked. */
    pause(): boolean;
    resume(): boolean;
    tab(which: "ranking" | "comparisons"): void;
    /** The open list as a readable export. */
    exportJSON(): ExportPayload;
    render(): void;
}
