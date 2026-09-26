import type { Tier } from "../sorter.ts";
import { css, esc, PairwiseElement } from "./base.ts";

const style = css(`
  ol { list-style: none; padding: 0; margin: 10px 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--pw-border); }
  li .n { color: var(--pw-accent); min-width: 1.6em; font-variant-numeric: tabular-nums; }
  li [part=name] { flex: 1; }
  li button { padding: 2px 9px; font-size: 12px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  [part=summary] { color: var(--pw-text); }
  input[type=number] { width: 5.5em; }
`);

/** The current tiers as `{tag, weight}`, the shape `setPriority` takes. The Sorter keeps weights parallel to tiers. */
const tiersOf = (p: readonly string[], w: readonly number[]): Tier[] => p.map((tag, i) => ({ tag, weight: w[i]! }));

/**
 * `<pairwise-tiers>` — the tier order. Tags listed here become tiers: anything in a higher tier
 * outranks anything lower without being asked. Add, reorder and remove tiers, and drop your own
 * answers that go against them.
 */
export class PairwiseTiers extends PairwiseElement {
  constructor() {
    super();
    this.root.innerHTML = `
      <p class="muted">Tier order — <span part="summary">off</span></p>
      <p part="untagged" class="muted" hidden>Tag items to use tiers: a higher tier then outranks a lower one without being asked.</p>
      <ol part="list"></ol>
      <div class="row"><select part="add-tag" aria-label="Tag to add as a tier"></select><button part="add">Add tier</button></div>
      <p part="overrides" class="banner" hidden><span></span><button title="Forget those answers and let the tier order decide those pairs">Drop them</button></p>`;
    const $ = (p: string) => this.root.querySelector<HTMLSelectElement>(`[part=${p}]`)!;
    $("add").onclick = () => this.#set((t) => [...t, { tag: $("add-tag").value }]);
    $("overrides").querySelector("button")!.onclick = () => this.sorter!.dropOverrides();
    $("list").onclick = (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      const i = Number(b.dataset.i);
      if (b.dataset.move) this.#set((t) => {
        const j = i + Number(b.dataset.move);
        [t[i], t[j]] = [t[j]!, t[i]!];
        return t;
      });
      else this.#set((t) => t.filter((_, k) => k !== i));
    };
  }

  protected styles() { return [style]; }

  render(): void {
    const $ = (p: string) => this.root.querySelector<HTMLElement>(`[part=${p}]`)!;
    const s = this.sorter, priority = s?.list.priority ?? [], tags = s?.tags() ?? [];
    $("summary").textContent = priority.length ? priority.map((t) => "#" + t).join(" › ") : "off";
    $("untagged").hidden = !s || tags.length > 0;
    $("list").innerHTML = priority.map((t, i) => `<li part="tier">
      <span class="n">${i + 1}</span><span part="name">#${esc(t)}</span>
      <button part="up" data-i="${i}" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(t)} up">↑</button>
      <button part="down" data-i="${i}" data-move="1" ${i === priority.length - 1 ? "disabled" : ""} aria-label="Move ${esc(t)} down">↓</button>
      <button part="remove" data-i="${i}" aria-label="Remove tier ${esc(t)}">✕</button></li>`).join("");
    const free = tags.filter((t) => !priority.includes(t));
    $("add-tag").innerHTML = free.map((t) => `<option value="${esc(t)}">#${esc(t)}</option>`).join("");
    ($("add") as HTMLButtonElement).disabled = !free.length;
    const over = s?.overrides().length ?? 0;
    $("overrides").hidden = !over;
    $("overrides").querySelector("span")!.textContent =
      `${over} answer${over === 1 ? " of yours overrides" : "s of yours override"} the tier order — yours win.`;
  }

  #set(edit: (tiers: Tier[]) => Tier[]): void {
    const l = this.sorter!.list;
    this.sorter!.setPriority(edit(tiersOf(l.priority, l.weights)));
  }
}

/**
 * `<pairwise-weights>` — how tiers combine. Strict order: a higher tier always wins. Weights:
 * each tier contributes in proportion, so a lower tier's best item can outrank a higher tier's worst.
 */
export class PairwiseWeights extends PairwiseElement {
  constructor() {
    super();
    this.root.innerHTML = `
      <div part="combine" class="row"><span class="muted">Combine tiers by</span>
        <label><input part="order" type="radio" name="combine" value="order"> Strict order</label>
        <label><input part="weights" type="radio" name="combine" value="weights"> Weights</label></div>
      <p part="note" class="muted"></p>
      <ol part="list"></ol>`;
    this.root.querySelector<HTMLElement>("[part=combine]")!.onchange = (e) =>
      this.sorter!.setCombine((e.target as HTMLInputElement).value as "order" | "weights");
    // On change, not input: re-cutting the ranking under a half-typed "0." would be wrong and jarring.
    this.root.querySelector<HTMLElement>("[part=list]")!.onchange = (e) => {
      const input = e.target as HTMLInputElement, l = this.sorter!.list;
      const tiers = tiersOf(l.priority, l.weights);
      tiers[Number(input.dataset.i)] = { tag: l.priority[Number(input.dataset.i)], weight: Number(input.value) };
      this.sorter!.setPriority(tiers);
    };
  }

  protected styles() { return [style]; }

  render(): void {
    const $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    const l = this.sorter?.list, priority = l?.priority ?? [], weighted = l?.combine === "weights";
    $("combine").hidden = !priority.length;
    $("order").checked = !weighted;
    $("weights").checked = weighted;
    $("note").textContent = !priority.length ? "Add tiers first — weights say how much each tier counts."
      : weighted ? "Every tier contributes in proportion to its weight, so a lower tier's best item can outrank a higher tier's worst. Position within a tier is scored by rank-order centroid, the fairest reading of an order when order is all you gave."
      : "A higher tier beats a lower one outright, whatever the items are.";
    $("list").innerHTML = weighted ? priority.map((t, i) => `<li><span part="name">#${esc(t)}</span>
      <input part="weight" type="number" min="0.1" step="0.1" data-i="${i}" value="${l!.weights[i]}" aria-label="Weight for ${esc(t)}"></li>`).join("") : "";
  }
}
