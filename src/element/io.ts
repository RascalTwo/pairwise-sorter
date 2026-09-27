import { parseItems, parseLine, toText } from "../parse.ts";
import { importList } from "../store.ts";
import { css, esc, PairwiseElement } from "./base.ts";

const style = css(`
  textarea { width: 100%; box-sizing: border-box; min-height: 240px; font: 14px/1.6 ui-monospace, monospace; resize: vertical; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  details { margin: 12px 0; font-size: 13px; color: var(--pw-muted); }
  code { background: var(--pw-panel); padding: 1px 5px; border-radius: 4px; }
  td { padding: 4px 14px 4px 0; vertical-align: top; }
  .search { display: flex; gap: 10px; align-items: center; margin: 8px 0; }
  .search input { flex: 1; max-width: 340px; }
  ul[part=filtered] { list-style: none; margin: 0; padding: 0; max-height: 420px; overflow: auto; border: 1px solid var(--pw-border);
    border-radius: var(--pw-radius); background: var(--pw-panel); }
  ul[part=filtered] li { padding: 7px 12px; border-bottom: 1px solid var(--pw-border); font: 13px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
`);

const FORMATS = `<details><summary>Input formats</summary><table>
  <tr><td><code>Cold brew</code></td><td>plain text</td></tr>
  <tr><td><code>[Title](https://…)</code></td><td>titled link</td></tr>
  <tr><td><code>Title | https://… | https://….jpg | https://….mp3 | Description</code></td><td>full card</td></tr>
  <tr><td><code>#gameplay #qol</code></td><td>tags (a field of <code>#</code>-tokens)</td></tr>
  <tr><td><code>[{"title":"…","url":"…","media":["…"],"desc":"…","tags":["…"]}]</code></td><td>JSON array</td></tr>
  </table><p>Pipe fields are matched by content, not order: an image, audio or video URL is media; the first other
  URL is the link; the first text is the title and the rest the description.</p></details>`;

/**
 * `<pairwise-io>` — the list as text to edit (default), or with `view="import"` a box to paste an
 * export into. Fires `pairwise-saved` after a save, `pairwise-imported` with the new list and
 * counts, and `pairwise-cancel` from the import view.
 */
export class PairwiseIo extends PairwiseElement {
  #filled = false;
  #query = "";

  static get observedAttributes() { return ["view"]; }
  attributeChangedCallback(): void { this.#build(); }

  constructor() {
    super();
    this.#build();
  }

  protected styles() { return [style]; }

  /**
   * Filter the item lines by title. The box is the input to Save, so it is never filtered in
   * place — a filtered box that got saved would drop every line it hid. Matches show read-only
   * beside it instead, and saving is locked until the filter is cleared.
   */
  get query(): string { return this.#query; }
  set query(q: string) {
    this.#query = q;
    const $ = (p: string) => this.root.querySelector<HTMLElement>(`[part=${p}]`);
    const filter = $("filter") as HTMLInputElement | null;
    if (!filter) return;
    filter.value = q;
    const on = !!q.trim(), needle = q.trim().toLowerCase();
    const lines = this.#box().value.split("\n").map((l) => l.trim()).filter(Boolean);
    const hits = lines.filter((l) => parseLine(l).title.toLowerCase().includes(needle));
    $("filtered")!.innerHTML = hits.map((l) => `<li>${esc(l)}</li>`).join("") || `<li class="muted">No titles match.</li>`;
    $("filtered")!.hidden = !on;
    this.#box().hidden = on;
    $("filter-count")!.textContent = on ? `showing ${hits.length} of ${lines.length}` : "";
    $("filter-clear")!.hidden = !on;
    const save = $("save") as HTMLButtonElement;
    save.disabled = on;
    save.textContent = on ? "Clear the filter to save" : "Save & sort";
  }

  /** Refill the text from the list, discarding unsaved edits. */
  reset(): void {
    this.#filled = false;
    this.#hint("");
    this.render();
  }

  /** Put text in the box with a note — e.g. an export the clipboard refused. */
  show(text: string, note: string): void {
    this.#box().value = text;
    this.#hint(note);
  }

  render(): void {
    if (this.#filled || !this.sorter || this.getAttribute("view") === "import") return;
    this.#box().value = toText(this.sorter.list.items);
    this.#filled = true;
    this.query = this.#query;
  }

  #build(): void {
    const importing = this.getAttribute("view") === "import";
    this.root.innerHTML = importing
      ? `<p class="muted">Paste a full export — items and comparisons. It lands as a new list, so nothing you already have is touched.</p>
        <textarea part="text" placeholder='{"format": "pairwise-sorter/3", "name": "…", "items": [...], "comparisons": [...]}'></textarea>
        <div class="row"><button part="import">Import as new list</button><button part="cancel">Cancel</button><span part="hint" class="muted"></span></div>`
      : `<p class="muted">One item per line — plain text, markdown links, pipe-separated fields, or a JSON array.</p>
        <div class="search"><input part="filter" type="search" placeholder="Filter by title…" aria-label="Filter items by title">
          <span part="filter-count" class="muted"></span><button part="filter-clear" hidden>Clear</button></div>
        <textarea part="text" placeholder="Cold brew&#10;[Flat white](https://example.com/fw)"></textarea>
        <ul part="filtered" hidden></ul>${FORMATS}
        <div class="row"><button part="save">Save &amp; sort</button><span part="hint" class="muted"></span></div>`;
    const on = (p: string, f: () => void) => { const b = this.root.querySelector<HTMLElement>(`[part=${p}]`); if (b) b.onclick = f; };
    on("save", () => this.#save());
    on("import", () => this.#import());
    on("cancel", () => this.fire("pairwise-cancel"));
    on("filter-clear", () => { this.query = ""; this.fire("pairwise-search", { query: "" }); });
    const filter = this.root.querySelector<HTMLInputElement>("[part=filter]");
    if (filter) filter.oninput = () => { this.query = filter.value; this.fire("pairwise-search", { query: filter.value }); };
    this.#filled = false;
    this.render();
  }

  #box = () => this.root.querySelector<HTMLTextAreaElement>("[part=text]")!;
  #hint = (text: string) => { this.root.querySelector("[part=hint]")!.textContent = text; };

  #save(): void {
    try {
      const { dupes, dropped } = this.sorter!.setItems(parseItems(this.#box().value));
      const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
      this.#hint([
        dupes.length ? `Merged ${n(dupes.length, "duplicate", "duplicates")}: ${dupes.join(", ")}.` : "",
        dropped ? `${n(dropped, "answer", "answers")} dropped with deleted items.` : "",
      ].filter(Boolean).join(" "));
      this.fire("pairwise-saved");
    } catch (err) {
      this.#hint((err as Error).message);
    }
  }

  #import(): void {
    try {
      const result = importList(JSON.parse(this.#box().value));
      this.#box().value = "";
      this.fire("pairwise-imported", result);
    } catch (err) {
      this.#hint("Could not import: " + (err as Error).message);
    }
  }
}
