import { tagOf } from "../item.ts";
import { css, esc, PairwiseElement } from "./base.ts";

const style = css(`
  dialog { border: 1px solid var(--pw-border); border-radius: 12px; background: var(--pw-bg); color: var(--pw-text);
           padding: 0; width: min(620px, calc(100vw - 48px)); }
  dialog::backdrop { background: rgba(0,0,0,.7); }
  form { display: flex; flex-direction: column; gap: 14px; padding: 22px 24px; }
  h2 { margin: 0; font-size: 17px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--pw-muted); }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .row input { flex: 1; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .tag button { border: 0; background: none; padding: 0 2px; color: inherit; }
  [part=error] { color: var(--pw-danger); margin: 0; }
`);

/**
 * `<pairwise-editor>` — a dialog editing one item: title, link, description, tags and media.
 * Call `edit(index)` to open it. A rename carries the item's answers across; a rename onto
 * another item is refused.
 */
export class PairwiseEditor extends PairwiseElement {
  #index = -1;
  #tags: string[] = [];
  #media: string[] = [];

  constructor() {
    super();
    this.root.innerHTML = `<dialog part="dialog"><form method="dialog" novalidate>
      <h2>Edit item</h2>
      <label>Title <input part="title" type="text" required></label>
      <label>Link <input part="url" type="url" placeholder="https://…"></label>
      <label>Description <textarea part="desc" rows="3"></textarea></label>
      <div><span class="muted">Tags</span><div part="tags" class="tags"></div>
        <div class="row"><input part="tag-input" type="text" list="tag-options" placeholder="Add a tag, then Enter">
          <datalist id="tag-options"></datalist><button part="tag-add" type="button">Add</button></div></div>
      <div><span class="muted">Media — images, audio and video, in order</span>
        <div part="media-list"></div><button part="media-add" type="button">+ Add media</button></div>
      <p part="error" hidden></p>
      <div class="row"><button part="save" type="submit">Save</button><button part="cancel" type="button">Cancel</button></div>
    </form></dialog>`;
    const $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    $("tag-add").onclick = () => this.#addTags();
    $("tag-input").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault(); // Enter adds a tag here; it must not submit the form
      this.#addTags();
    };
    $("tags").onclick = (e) => {
      const i = (e.target as HTMLElement).closest("button")?.dataset.i;
      if (i) { this.#tags.splice(Number(i), 1); this.#draw(); }
    };
    $("media-add").onclick = () => { this.#media.push(""); this.#draw(); };
    $("media-list").oninput = (e) => {
      const input = e.target as HTMLInputElement;
      this.#media[Number(input.dataset.i)] = input.value;
    };
    $("media-list").onclick = (e) => {
      const d = (e.target as HTMLElement).closest("button")?.dataset;
      if (!d) return;
      const i = Number(d.i), m = this.#media;
      if (d.move) { const j = i + Number(d.move); [m[i], m[j]] = [m[j]!, m[i]!]; }
      else m.splice(i, 1);
      this.#draw();
    };
    $("cancel").onclick = () => this.#dialog.close();
    this.root.querySelector("form")!.onsubmit = (e) => { e.preventDefault(); this.#save(); };
  }

  protected styles() { return [style]; }

  get #dialog(): HTMLDialogElement { return this.root.querySelector("dialog")!; }

  /** Open the editor on `list.items[index]`. */
  edit(index: number): void {
    const it = this.sorter?.list.items[index];
    if (!it) return;
    const $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    this.#index = index;
    this.#tags = [...it.tags];
    this.#media = [...it.media];
    $("title").value = it.title;
    $("url").value = it.url;
    $("desc").value = it.desc;
    $("tag-input").value = "";
    $("error").hidden = true;
    this.root.querySelector("datalist")!.innerHTML = this.sorter!.tags().map((t) => `<option value="${esc(t)}">`).join("");
    this.#draw();
    this.#dialog.showModal();
  }

  render(): void {}

  #addTags(): void {
    const input = this.root.querySelector<HTMLInputElement>("[part=tag-input]")!;
    // Commas split, so pasting "gameplay, qol" does the obvious thing.
    for (const t of input.value.split(",").map(tagOf)) if (t && !this.#tags.includes(t)) this.#tags.push(t);
    input.value = "";
    this.#draw();
  }

  #draw(): void {
    const tags = this.root.querySelector("[part=tags]")!, media = this.root.querySelector("[part=media-list]")!;
    tags.innerHTML = this.#tags.map((t, i) => `<span class="tag">#${esc(t)} <button type="button" data-i="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join("")
      || `<span class="muted">No tags yet.</span>`;
    const last = this.#media.length - 1;
    media.innerHTML = this.#media.map((m, i) => `<div part="media" class="row">
      <input part="media-url" type="url" data-i="${i}" value="${esc(m)}" aria-label="Media URL ${i + 1}">
      <button type="button" data-i="${i}" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move media ${i + 1} up">↑</button>
      <button type="button" data-i="${i}" data-move="1" ${i === last ? "disabled" : ""} aria-label="Move media ${i + 1} down">↓</button>
      <button type="button" data-i="${i}" aria-label="Remove media ${i + 1}">✕</button></div>`).join("")
      || `<span class="muted">No media yet.</span>`;
  }

  async #save(): Promise<void> {
    const $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    this.#addTags(); // a tag left typed but not added still counts
    try {
      await this.sorter!.editItem(this.#index, {
        title: $("title").value, url: $("url").value.trim(), desc: $("desc").value.trim(),
        tags: this.#tags, media: this.#media.map((m) => m.trim()).filter(Boolean),
      });
      this.#dialog.close();
    } catch (err) {
      $("error").textContent = (err as Error).message;
      $("error").hidden = false;
    }
  }
}
