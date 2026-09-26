import type { Sorter } from "../sorter.ts";
import { css, esc, PairwiseElement } from "./base.ts";

const style = css(`
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-bottom: 1px solid var(--pw-border); }
  li [part=pair] { flex: 1; overflow-wrap: anywhere; }
  li.conflict { border-left: 3px solid var(--pw-warn); padding-left: 9px; }
  [part=why] { color: var(--pw-warn); font-size: 12px; }
  li button { padding: 3px 10px; font-size: 12px; }
  li button:hover { color: var(--pw-danger); border-color: var(--pw-danger); }
`);

/**
 * `<pairwise-conflicts>` — every answer you gave, newest last, each deletable. Answers the
 * ranking contradicts are flagged; Resolve reorders to contradict as few as possible.
 */
export class PairwiseConflicts extends PairwiseElement {
  #result = "";

  constructor() {
    super();
    this.root.innerHTML = `
      <p part="banner" class="banner" hidden><span></span><button part="resolve" title="Reorder to contradict as few of your answers as possible">Resolve</button></p>
      <p part="result" class="banner info" hidden></p>
      <p part="empty" class="muted" hidden>No comparisons recorded yet.</p>
      <ul part="list"></ul>`;
    this.root.querySelector<HTMLElement>("[part=resolve]")!.onclick = () => this.#resolve();
    this.root.querySelector<HTMLElement>("[part=list]")!.onclick = (e) => {
      const i = (e.target as HTMLElement).closest("button")?.dataset.delete;
      if (i) this.sorter!.deleteAnswer(Number(i));
    };
  }

  protected styles() { return [style]; }

  protected listen(s: Sorter, signal: AbortSignal): void {
    // A resolve lasts until the next change re-runs the sort, and so does its note.
    s.addEventListener("change", () => { this.#result = ""; this.render(); }, { signal });
  }

  render(): void {
    const $ = (p: string) => this.root.querySelector<HTMLElement>(`[part=${p}]`)!;
    const all = this.sorter?.comparisons() ?? [];
    const bad = all.filter((c) => c.why).length;
    $("banner").hidden = !bad;
    $("banner").querySelector("span")!.textContent =
      `⚠ ${bad} answer${bad === 1 ? " contradicts" : "s contradict"} the ranking — your choices can't all be true at once.`;
    $("result").hidden = !this.#result;
    $("result").textContent = this.#result;
    $("empty").hidden = !this.sorter || all.length > 0;
    $("list").innerHTML = all.map((c) => {
      const pair = c.verdict === 0 ? [c.a.title, "=", c.b.title] : c.verdict < 0 ? [c.a.title, "›", c.b.title] : [c.b.title, "›", c.a.title];
      return `<li part="answer${c.why ? " conflict" : ""}" class="${c.why ? "conflict" : ""}">
        <span part="pair">${pair.map(esc).join(" ")}</span>
        ${c.why ? `<span part="why">${esc(c.why)}</span>` : ""}
        <button part="delete" data-delete="${c.index}" title="Forget this answer — it will be asked again if the sort still needs it">delete</button>
      </li>`;
    }).join("");
  }

  #resolve(): void {
    const { before, after } = this.sorter!.resolve();
    const s = (n: number) => (n === 1 ? "" : "s");
    this.#result = after < before
      ? `Reordered — now contradicts ${after} of your answers, down from ${before}. This is a best-effort search rather than a proof of the true minimum, and it lasts until the next change re-runs the sort.`
      : `Already as consistent as this search can make it — ${before} answer${s(before)} still contradicted. Those are genuine cycles: no order can satisfy them all, so the fix is to change an answer.`;
    this.render();
  }
}
