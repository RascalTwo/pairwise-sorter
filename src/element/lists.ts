import type { Library } from "../store.ts";
import { css, esc, PairwiseElement } from "./base.ts";

const style = css(`
  :host { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  [part=name] { flex: 1; min-width: 140px; max-width: 380px; }
  [part=delete].armed { border-color: var(--pw-danger); color: var(--pw-danger); }
`);

/**
 * `<pairwise-lists>` — pick, name, create, import and delete lists. A view only: it shows
 * `.library` and fires `pairwise-list-open` {id}, `pairwise-list-new`, `pairwise-list-rename`
 * {name}, `pairwise-list-delete` and `pairwise-import` for the host to act on.
 */
export class PairwiseLists extends PairwiseElement {
  #library: Library | null = null;
  /** How long an armed Delete waits for its second click, in ms. */
  disarmAfter = 4000;

  constructor() {
    super();
    this.root.innerHTML = `
      <select part="pick" aria-label="Switch list"></select>
      <input part="name" placeholder="List name" aria-label="Rename this list">
      <button part="new">+ New list</button>
      <button part="import">Import JSON</button>
      <button part="delete">Delete</button>`;
    const $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    $("pick").onchange = () => this.fire("pairwise-list-open", { id: $("pick").value });
    $("name").oninput = () => this.fire("pairwise-list-rename", { name: $("name").value });
    $("new").onclick = () => this.fire("pairwise-list-new");
    $("import").onclick = () => this.fire("pairwise-import");
    // Two clicks instead of confirm(): a modal would block the page.
    $("delete").onclick = () => {
      const del = $("delete");
      if (del.classList.toggle("armed")) {
        del.textContent = "Really delete?";
        setTimeout(() => this.#disarm(), this.disarmAfter);
        return;
      }
      this.#disarm();
      this.fire("pairwise-list-delete");
    };
  }

  protected styles() { return [style]; }

  /** The lists to show. */
  set library(lib: Library | null) { this.#library = lib; this.render(); }

  render(): void {
    const lib = this.#library, $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    $("pick").innerHTML = Object.entries(lib?.lists ?? {})
      .map(([id, l]) => `<option value="${esc(id)}">${esc(l.name || "Untitled")} (${l.items.length})</option>`).join("");
    if (!lib?.current) return;
    $("pick").value = lib.current;
    if (this.root.activeElement !== $("name")) $("name").value = lib.lists[lib.current]!.name;
  }

  #disarm(): void {
    const del = this.root.querySelector<HTMLElement>("[part=delete]")!;
    del.classList.remove("armed");
    del.textContent = "Delete";
  }
}
