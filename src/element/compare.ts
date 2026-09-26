import { idOf, type Item } from "../item.ts";
import type { Sorter } from "../sorter.ts";
import { css, esc, PairwiseElement } from "./base.ts";
import { imagesOf, Lightbox, mediaHTML, mediaStyle, preload, tagChip } from "./media.ts";

/** A card shows at most two rows of media and pages through the rest. */
const PER_PAGE = 4;
const SIDES = ["a", "b"] as const;

const style = css(`
  .duel { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .card { position: relative; background: var(--pw-panel); border: 2px solid var(--pw-border); border-radius: 12px;
          padding: 48px 24px 24px; min-height: 180px; display: flex; flex-direction: column; align-items: center;
          gap: 14px; text-align: center; }
  .card:has(.choose:hover) { border-color: var(--pw-accent); }
  .body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; width: 100%; }
  .title { font-size: 20px; line-height: 1.4; overflow-wrap: anywhere; }
  .desc { font-size: 13px; color: var(--pw-muted); overflow-wrap: anywhere; }
  .media { display: grid; gap: 8px; width: 100%; justify-items: center; align-items: center; }
  .media.many { grid-template-columns: 1fr 1fr; }
  .media img, .media video { max-height: min(340px, 34vh); }
  .media.many img, .media.many video { max-height: min(150px, 18vh); }
  .pages { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 12px; color: var(--pw-muted); }
  .pages button { padding: 1px 9px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  .choose { width: 100%; font-weight: 600; }
  .act { position: absolute; top: 10px; width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center;
         justify-content: center; color: var(--pw-muted); text-decoration: none; opacity: .5;
         border: 1px solid var(--pw-border); border-radius: var(--pw-radius); }
  .card:hover .act, .act:focus-visible { opacity: 1; }
  .act.open { left: 10px; }
  .act.edit { right: 46px; }
  .act.bench { right: 10px; }
  .act.bench:hover { color: var(--pw-danger); border-color: var(--pw-danger); }
  .equal { display: flex; justify-content: center; margin-top: 16px; }
`);

/**
 * `<pairwise-compare>` — the question being asked: two cards, Choose buttons and Equal.
 * Keys ← / → choose, ↓ or = means equal, Backspace undoes (turn off with `no-keyboard`); a key
 * another handler already prevented is left alone.
 * Images open in a lightbox instead of voting. Set `renderItem(item, box)` to draw items
 * yourself. Fires `pairwise-edit` with `{index}` when an item's edit button is pressed.
 */
export class PairwiseCompare extends PairwiseElement {
  /** Draw an item into its card instead of the default title, media, description and tags. */
  renderItem?: (item: Item, box: HTMLElement) => void;
  #pages = { a: 0, b: 0 };
  #asked = "";
  readonly #lightbox: Lightbox;

  constructor() {
    super();
    this.root.innerHTML = `
      <p part="idle" class="muted">Nothing to compare right now.</p>
      <div part="duel" class="duel"></div>
      <div class="equal"><button part="equal">Equal <span class="muted">(↓ or =)</span></button></div>
      ${Lightbox.html}`;
    this.#lightbox = new Lightbox(this.root);
    this.root.querySelector<HTMLElement>("[part=equal]")!.onclick = () => this.sorter?.answer(0);
    this.root.querySelector<HTMLElement>("[part=duel]")!.onclick = (e) => this.#click(e);
  }

  protected styles() { return [mediaStyle, style]; }

  protected listen(s: Sorter, signal: AbortSignal): void {
    s.addEventListener("upcoming", (e) => preload(s.list.items, (e as CustomEvent<number[]>).detail), { signal });
  }

  connectedCallback(): void {
    super.connectedCallback();
    addEventListener("keydown", this.#keys);
  }

  disconnectedCallback(): void {
    removeEventListener("keydown", this.#keys);
  }

  render(): void {
    const q = this.sorter?.question;
    this.root.querySelector<HTMLElement>("[part=idle]")!.hidden = !!q;
    this.root.querySelector<HTMLElement>(".equal")!.hidden = !q;
    const duel = this.root.querySelector<HTMLElement>("[part=duel]")!;
    if (!q) { duel.innerHTML = ""; return; }
    const asked = `${q.a},${q.b}`;
    if (asked !== this.#asked) this.#pages = { a: 0, b: 0 };
    this.#asked = asked;
    duel.innerHTML = SIDES.map((side) => this.#card(side, q[side])).join("");
    if (this.renderItem) for (const side of SIDES)
      this.renderItem(this.#item(side), duel.querySelector<HTMLElement>(`[part~=body-${side}]`)!);
  }

  #item(side: "a" | "b"): Item {
    const s = this.sorter!;
    return s.list.items[s.question![side]]!;
  }

  #card(side: "a" | "b", index: number): string {
    const s = this.sorter!, it = s.list.items[index]!;
    const pages = Math.max(1, Math.ceil(it.media.length / PER_PAGE));
    const page = ((this.#pages[side] % pages) + pages) % pages;
    const shown = it.media.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    const body = this.renderItem ? "" : [
      shown.length ? `<div class="media${shown.length > 1 ? " many" : ""}">${shown.map(mediaHTML).join("")}</div>` : "",
      pages > 1 ? `<div part="pages" class="pages"><button data-side="${side}" data-step="-1" aria-label="Previous media">‹</button>
        <span>${page + 1} / ${pages}</span><button data-side="${side}" data-step="1" aria-label="More media">›</button></div>` : "",
      `<div part="title title-${side}" class="title">${esc(it.title)}</div>`,
      it.desc ? `<div part="desc" class="desc">${esc(it.desc)}</div>` : "",
      it.tags.length ? `<div class="tags">${it.tags.map((t) => tagChip(t, s.list.priority)).join("")}</div>` : "",
    ].join("");
    const name = esc(it.title);
    return `<div part="card card-${side}" class="card">
      <div part="body body-${side}" class="body">${body}</div>
      <button part="choose choose-${side}" class="choose" data-choose="${side}" aria-label="Choose ${name}">${side === "a" ? "← Choose this" : "Choose this →"}</button>
      <a part="open open-${side}" class="act open" href="${esc(it.url)}" target="_blank" rel="noopener" ${it.url ? "" : "hidden"} aria-label="Open ${name} in a new tab">↗</a>
      <button part="edit edit-${side}" class="act edit" data-edit="${index}" aria-label="Edit ${name}">✎</button>
      <button part="bench bench-${side}" class="act bench" data-bench="${side}" aria-label="Bench ${name}">✕</button>
    </div>`;
  }

  #click(e: MouseEvent): void {
    const t = e.target as HTMLElement, s = this.sorter!;
    const img = t.closest("img");
    if (img) {
      this.#lightbox.show(img.getAttribute("src")!, [...imagesOf(this.#item("a")), ...imagesOf(this.#item("b"))]);
      return;
    }
    const d = t.closest<HTMLElement>("button")?.dataset;
    if (!d) return;
    if (d.choose) s.answer(d.choose === "a" ? -1 : 1);
    else if (d.step) {
      const side = d.side as "a" | "b";
      this.#pages[side] += Number(d.step);
      this.render();
    } else if (d.edit) this.fire("pairwise-edit", { index: Number(d.edit) });
    else if (d.bench) s.bench([idOf(this.#item(d.bench as "a" | "b"))]);
  }

  #keys = (e: KeyboardEvent): void => {
    if (this.#lightbox.isOpen) return;
    const s = this.sorter;
    // defaultPrevented: another widget on the page already used this key.
    if (e.defaultPrevented || !s?.question || this.hasAttribute("no-keyboard") || !this.checkVisibility()) return;
    const path = e.composedPath(), target = path[0];
    if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]")) return;
    // Focus inside an open dialog (an item editor, say) means these keys are not answers.
    if (path.some((n) => n instanceof HTMLDialogElement && n.open)) return;
    const v = ({ ArrowLeft: -1, ArrowRight: 1, ArrowDown: 0, "=": 0 } as const)[e.key as "ArrowLeft"];
    if (v !== undefined) { e.preventDefault(); s.answer(v); }
    else if (e.key === "Backspace") { e.preventDefault(); s.undo(); }
  };
}
