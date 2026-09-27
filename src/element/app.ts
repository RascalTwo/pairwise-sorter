import { Sorter } from "../sorter.ts";
import { addList, deleteList, emptyLibrary, exportList, localStore, type ExportPayload, type Library, type List } from "../store.ts";
import { css, PairwiseElement } from "./base.ts";
import type { PairwiseBench } from "./bench.ts";
import type { PairwiseConflicts } from "./conflicts.ts";
import type { PairwiseEditor } from "./editor.ts";
import type { PairwiseIo } from "./io.ts";
import type { PairwiseLists } from "./lists.ts";
import type { PairwiseRanking } from "./ranking.ts";

/** What the app is showing. */
export type Screen = "setup" | "import" | "compare" | "done";

const style = css(`
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; margin: 16px 0; }
  .row > span { display: flex; gap: 10px; flex-wrap: wrap; }
  pairwise-lists { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--pw-border); }
  pairwise-progress { margin-top: 24px; }
  details { margin: 12px 0; }
  summary { cursor: pointer; color: var(--pw-muted); font-size: 13px; }
  .tabs button.on { border-color: var(--pw-accent); }
  .search { display: flex; gap: 10px; align-items: center; margin: 8px 0; }
  .search input { flex: 1; max-width: 340px; }
`);

/**
 * `<pairwise-sorter>` — the whole app: several lists, items as text, the questions, the
 * ranking and the answers, tiers, the bench and an item editor. In memory by default; add
 * `storage-key="…"` to keep it in localStorage, or set `.library` and save on `pairwise-change`.
 */
export class PairwiseSorter extends PairwiseElement {
  #library: Library = emptyLibrary();
  #store: ReturnType<typeof localStore> | null = null;
  #view: "sort" | "setup" | "import" = "sort";
  #paused = false;
  #tab: "ranking" | "comparisons" = "ranking";
  #note = "";
  #query = "";
  #started = false;

  constructor() {
    super();
    this.root.innerHTML = `
      <pairwise-lists></pairwise-lists>
      <section part="setup"><pairwise-io></pairwise-io></section>
      <section part="import"><pairwise-io view="import"></pairwise-io></section>
      <section part="compare"><pairwise-compare></pairwise-compare><pairwise-progress></pairwise-progress></section>
      <section part="done">
        <div class="row"><strong part="heading"></strong>
          <span class="tabs"><button part="tab-ranking"></button><button part="tab-comparisons"></button></span></div>
        <p part="conflict-banner" class="banner"><span></span><button part="show-conflicts">Show them</button>
          <button part="resolve" title="Reorder to contradict as few of your answers as possible">Resolve</button></p>
        <p part="resolve-note" class="banner info" hidden></p>
        <details part="tiers-panel"><summary>Tiers and weights</summary><pairwise-tiers></pairwise-tiers><pairwise-weights></pairwise-weights></details>
        <div class="search"><input part="search" type="search" placeholder="Filter by title…" aria-label="Filter by title">
          <button part="clear-search" hidden>Clear</button></div>
        <pairwise-ranking no-search></pairwise-ranking><pairwise-conflicts></pairwise-conflicts>
      </section>
      <div class="row" part="controls">
        <span><button part="undo">↩ Undo</button><button part="resume">↩ Resume sorting</button></span>
        <span><button part="pause">See list so far</button><button part="export">Export JSON</button>
          <button part="edit-list">Edit list</button><button part="reset">Reset answers</button></span>
      </div>
      <details part="bench-panel"><summary>Bench</summary><pairwise-bench></pairwise-bench></details>
      <pairwise-editor></pairwise-editor>`;
    const $ = (p: string) => this.root.querySelector<HTMLElement>(`[part=${p}]`)!;
    const on = (type: string, f: (d: any) => void) => this.root.addEventListener(type, (e) => { e.stopPropagation(); f((e as CustomEvent).detail); });
    $("undo").onclick = () => this.sorter!.undo();
    $("reset").onclick = () => this.sorter!.resetAnswers();
    $("edit-list").onclick = () => this.goto("setup");
    $("pause").onclick = () => this.pause();
    $("resume").onclick = () => this.resume();
    $("export").onclick = () => this.#copy();
    $("tab-ranking").onclick = () => this.tab("ranking");
    $("tab-comparisons").onclick = () => this.tab("comparisons");
    $("show-conflicts").onclick = () => this.tab("comparisons");
    $("resolve").onclick = () => { this.#note = this.#child<PairwiseConflicts>("pairwise-conflicts").resolve(); this.render(); };
    $("search").oninput = () => this.search(($("search") as HTMLInputElement).value);
    $("clear-search").onclick = () => this.search("");
    on("pairwise-search", (d) => this.search(d.query));
    // Benching from the results can raise a new question (the item was the only link between
    // two others). Keep the list on screen and offer Resume, rather than jumping to the question.
    on("pairwise-benched", () => { if (this.screen === "done") this.#paused = true; this.render(); });
    on("pairwise-edit", (d) => this.root.querySelector<PairwiseEditor>("pairwise-editor")!.edit(d.index));
    on("pairwise-stop", () => this.pause());
    on("pairwise-list-open", (d) => this.openList(d.id));
    on("pairwise-list-new", () => this.newList());
    on("pairwise-list-rename", (d) => this.renameList(d.name));
    on("pairwise-list-delete", () => this.deleteList(this.#library.current!));
    on("pairwise-import", () => this.goto("import"));
    on("pairwise-imported", (d) => this.addList(d.list));
    on("pairwise-cancel", () => this.goto("compare"));
    on("pairwise-saved", () => { this.#view = "sort"; this.#paused = false; this.render(); });
    this.sorter = new Sorter();
    this.sorter.addEventListener("change", () => { this.#note = ""; this.#save(); });
    this.sorter.addEventListener("done", () => { this.#paused = false; this.render(); });
  }

  protected styles() { return [style]; }

  connectedCallback(): void {
    if (!this.#started) {
      this.#started = true;
      const key = this.getAttribute("storage-key");
      if (key) this.#store = localStore(key);
      this.library = this.#store?.load() ?? this.#library;
    }
    super.connectedCallback();
  }

  /** Every list. Setting it opens its current list (or a new one); the host keeps ownership. */
  get library(): Library { return this.#library; }
  set library(lib: Library) {
    this.#library = lib;
    const id = lib.current && lib.lists[lib.current] ? lib.current : Object.keys(lib.lists)[0];
    if (id) this.openList(id); else this.newList();
  }

  /** What is on screen. */
  get screen(): Screen {
    const s = this.sorter!;
    if (this.#view !== "sort") return this.#view;
    if (s.live().length < 2) return "setup";
    return s.question && !this.#paused ? "compare" : "done";
  }

  get paused(): boolean { return this.#paused && !!this.sorter!.question; }

  /** The title filter across the ranking, the answers, the bench and the items text. Display only. */
  get query(): string { return this.#query; }

  search(query: string): void {
    this.#query = query;
    (this.root.querySelector<HTMLInputElement>("[part=search]")!).value = query;
    for (const el of this.root.querySelectorAll<PairwiseRanking | PairwiseConflicts | PairwiseBench | PairwiseIo>(
      "pairwise-ranking, pairwise-conflicts, pairwise-bench, pairwise-io")) el.query = query;
    this.render();
  }

  openList(id: string): void {
    this.#library.current = id;
    this.#view = "sort";
    this.#paused = false;
    this.sorter!.open(this.#library.lists[id]!);
    this.root.querySelector<PairwiseIo>("pairwise-io")!.reset();
    // A filter carried over from another list would read as data loss.
    this.search("");
    this.#save();
  }

  newList(name?: string): string {
    const id = addList(this.#library, name);
    this.openList(id);
    return id;
  }

  /** Add an existing list (an import, say) and open it. */
  addList(list: List): string {
    const id = this.newList();
    this.#library.lists[id] = list;
    this.openList(id);
    return id;
  }

  renameList(name: string): void {
    this.sorter!.list.name = name;
    this.#save();
  }

  deleteList(id: string): void {
    deleteList(this.#library, id);
    this.library = this.#library;
  }

  goto(screen: Screen): void {
    this.#view = screen === "setup" || screen === "import" ? screen : "sort";
    this.#paused = screen === "done";
    if (screen === "setup") this.root.querySelector<PairwiseIo>("pairwise-io")!.reset();
    this.render();
  }

  /** Leave the question to see the ranking so far. False when nothing is being asked. */
  pause(): boolean {
    if (!this.sorter!.question) return false;
    this.goto("done");
    return true;
  }

  resume(): boolean {
    if (!this.paused) return false;
    this.goto("compare");
    return true;
  }

  tab(which: "ranking" | "comparisons"): void {
    this.#tab = which;
    this.render();
  }

  /** The open list as a readable export. */
  exportJSON(): ExportPayload {
    return exportList(this.sorter!.list, this.sorter!.ranking().map((r) => r.item.title));
  }

  render(): void {
    const s = this.sorter!, lists = this.root.querySelector<PairwiseLists>("pairwise-lists")!;
    const $ = (p: string) => this.root.querySelector<HTMLElement>(`[part=${p}]`)!;
    const screen = this.screen, cmp = this.#tab === "comparisons";
    for (const el of this.root.querySelectorAll<PairwiseElement>("pairwise-io, pairwise-compare, pairwise-progress, pairwise-tiers, pairwise-weights, pairwise-ranking, pairwise-conflicts, pairwise-bench, pairwise-editor"))
      if (el.sorter !== s) el.sorter = s;
    lists.library = this.#library;
    for (const part of ["setup", "import", "compare", "done"]) $(part).hidden = part !== screen;
    $("controls").hidden = screen === "setup" || screen === "import";
    $("pause").hidden = screen !== "compare";
    $("resume").hidden = !this.paused;
    $("export").hidden = screen !== "done";
    $("heading").textContent = cmp ? "Comparisons you made" : "Sorted — best first";
    $("tab-ranking").textContent = `${s.ranking().length} items`;
    $("tab-comparisons").textContent = `${s.list.log.length} comparisons`;
    $("tab-ranking").classList.toggle("on", !cmp);
    $("tab-comparisons").classList.toggle("on", cmp);
    this.root.querySelector<HTMLElement>("pairwise-ranking")!.hidden = cmp;
    this.root.querySelector<HTMLElement>("pairwise-conflicts")!.hidden = !cmp;
    $("tiers-panel").hidden = !s.tags().length;
    const bad = s.comparisons().filter((c) => c.why).length;
    $("conflict-banner").hidden = cmp || !s.complete || !bad;
    $("conflict-banner").querySelector("span")!.textContent =
      `⚠ ${bad} answer${bad === 1 ? " contradicts" : "s contradict"} the ranking — your choices can't all be true at once.`;
    $("resolve-note").hidden = cmp || !this.#note;
    $("resolve-note").textContent = this.#note;
    $("clear-search").hidden = !this.#query;
    $("bench-panel").hidden = !s.list.benched.length;
  }

  #child<T extends Element>(tag: string): T { return this.root.querySelector<T>(tag)!; }

  #save(): void {
    this.#store?.save(this.#library);
    this.fire("pairwise-change", { library: this.#library });
    this.render();
  }

  async #copy(): Promise<void> {
    const text = JSON.stringify(this.exportJSON(), null, 2), btn = this.root.querySelector<HTMLElement>("[part=export]")!;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Export JSON"), 1200);
    } catch {
      this.goto("import");
      this.root.querySelector<PairwiseIo>("pairwise-io[view=import]")!.show(text, "Copy failed — the export is in the box below; select it and copy.");
    }
  }
}
