import { parseItems, toText } from "../parse.ts";
import { importList } from "../store.ts";
import { css, PairwiseElement } from "./base.ts";

const style = css(`
  textarea { width: 100%; box-sizing: border-box; min-height: 240px; font: 14px/1.6 ui-monospace, monospace; resize: vertical; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  details { margin: 12px 0; font-size: 13px; color: var(--pw-muted); }
  code { background: var(--pw-panel); padding: 1px 5px; border-radius: 4px; }
  td { padding: 4px 14px 4px 0; vertical-align: top; }
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

  static get observedAttributes() { return ["view"]; }
  attributeChangedCallback(): void { this.#build(); }

  constructor() {
    super();
    this.#build();
  }

  protected styles() { return [style]; }

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
  }

  #build(): void {
    const importing = this.getAttribute("view") === "import";
    this.root.innerHTML = importing
      ? `<p class="muted">Paste a full export — items and comparisons. It lands as a new list, so nothing you already have is touched.</p>
        <textarea part="text" placeholder='{"format": "pairwise-sorter/3", "name": "…", "items": [...], "comparisons": [...]}'></textarea>
        <div class="row"><button part="import">Import as new list</button><button part="cancel">Cancel</button><span part="hint" class="muted"></span></div>`
      : `<p class="muted">One item per line — plain text, markdown links, pipe-separated fields, or a JSON array.</p>
        <textarea part="text" placeholder="Cold brew&#10;[Flat white](https://example.com/fw)"></textarea>${FORMATS}
        <div class="row"><button part="save">Save &amp; sort</button><span part="hint" class="muted"></span></div>`;
    const on = (p: string, f: () => void) => { const b = this.root.querySelector<HTMLElement>(`[part=${p}]`); if (b) b.onclick = f; };
    on("save", () => this.#save());
    on("import", () => this.#import());
    on("cancel", () => this.fire("pairwise-cancel"));
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
