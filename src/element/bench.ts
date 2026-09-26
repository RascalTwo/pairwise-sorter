import { idOf } from "../item.ts";
import { css, esc, PairwiseElement } from "./base.ts";

const style = css(`
  ul { list-style: none; padding: 0; margin: 10px 0 0; }
  li { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--pw-border); }
  li [part=name] { flex: 1; color: var(--pw-muted); overflow-wrap: anywhere; }
  li button { padding: 3px 10px; font-size: 12px; }
`);

/**
 * `<pairwise-bench>` — items taken out of the ranking. "Benched", not "removed": each keeps its
 * answers and is one click from coming back. Fires `pairwise-edit` with `{index}`.
 */
export class PairwiseBench extends PairwiseElement {
  constructor() {
    super();
    this.root.innerHTML = `
      <div class="muted">Benched — <span part="count">0</span>
        <button part="sub-all">Sub all in</button></div>
      <ul part="list"></ul>`;
    this.root.querySelector<HTMLElement>("[part=sub-all]")!.onclick = () => this.sorter!.subAll();
    this.root.querySelector<HTMLElement>("[part=list]")!.onclick = (e) => {
      const d = (e.target as HTMLElement).closest("button")?.dataset;
      if (!d) return;
      const s = this.sorter!, i = Number(d.i);
      if (d.edit) this.fire("pairwise-edit", { index: i });
      else s.subIn(idOf(s.list.items[i]));
    };
  }

  protected styles() { return [style]; }

  render(): void {
    const s = this.sorter, benched = s?.benchedItems() ?? [];
    this.root.querySelector("[part=count]")!.textContent = String(benched.length);
    this.root.querySelector("[part=list]")!.innerHTML = benched.map((it) => {
      const i = s!.list.items.indexOf(it), name = esc(it.title);
      return `<li part="benched"><span part="name">${name}</span>
        <button part="edit" data-i="${i}" data-edit="1" aria-label="Edit ${name}">✎</button>
        <button part="sub-in" data-i="${i}">Sub in</button></li>`;
    }).join("");
  }
}
