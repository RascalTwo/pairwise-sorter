import { STOP_AT } from "../analysis.ts";
import { css, PairwiseElement } from "./base.ts";

const style = css(`
  .bar { height: 8px; background: var(--pw-panel); border: 1px solid var(--pw-border); border-radius: 4px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: var(--pw-accent); transition: width .25s; }
  [part=status] { margin-top: 8px; font-variant-numeric: tabular-nums; }
`);

/**
 * `<pairwise-progress>` — answers given against the worst case, how many items are already
 * placed (placed items are final), and, past halfway, an offer to stop. Fires `pairwise-stop`.
 */
export class PairwiseProgress extends PairwiseElement {
  protected styles() { return [style]; }

  render(): void {
    const s = this.sorter;
    if (!s) { this.root.innerHTML = ""; return; }
    const answered = s.list.log.length, total = s.budget(), at = s.placement();
    const canStop = !!s.question && at.pct >= STOP_AT && at.placed < at.total;
    this.root.innerHTML = `
      <div class="bar" part="bar"><i part="fill" style="width:${Math.min(100, (answered / total) * 100)}%"></i></div>
      <div part="status" class="muted">${answered} of ~${total} comparisons · ${at.placed} of ${at.total} placed</div>
      <p part="stop" class="banner info" ${canStop ? "" : "hidden"}>
        ${at.placed} of ${at.total} items are placed, and placed items are already in their final order —
        you can stop here and keep them. The rest simply have no position yet.
        <button>See the list</button>
      </p>`;
    this.root.querySelector("button")!.onclick = () => this.fire("pairwise-stop");
  }
}
