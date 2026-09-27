import { tierName, tierOf } from "../engine.ts";
import { idOf, type Item } from "../item.ts";
import { css, esc, PairwiseElement } from "./base.ts";
import { imagesOf, Lightbox, mediaHTML, mediaStyle, tagChip } from "./media.ts";

const style = css(`
  .tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
  .tools input { flex: 1; max-width: 340px; }
  ol, ul { list-style: none; padding: 0; margin: 0; }
  ol.filtering { border-left: 3px solid var(--pw-warn); padding-left: 11px; }
  li { display: flex; flex-wrap: wrap; gap: 14px; align-items: baseline; padding: 9px 12px; border-bottom: 1px solid var(--pw-border); }
  .rank { min-width: 2.2em; text-align: right; color: var(--pw-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
  li.tied .rank { color: var(--pw-warn); }
  .title { background: none; border: 0; padding: 0; color: var(--pw-text); text-align: left; font-size: inherit; }
  button.title { cursor: pointer; }
  button.title::before { content: "▸"; display: inline-block; width: 1em; color: var(--pw-muted); transition: transform .12s; }
  button.title[aria-expanded=true]::before { transform: rotate(90deg); }
  span.title::before { content: ""; display: inline-block; width: 1em; }
  .tags { display: inline-flex; flex-wrap: wrap; gap: 6px; }
  .acts { margin-left: auto; display: inline-flex; gap: 8px; align-items: center; }
  .acts button { padding: 1px 8px; font-size: 12px; opacity: .4; }
  li:hover .acts button, .acts button:focus-visible { opacity: 1; }
  .acts [part~=bench]:hover { color: var(--pw-danger); border-color: var(--pw-danger); }
  .detail { flex-basis: 100%; padding: 6px 0 4px 3.4em; }
  .strip { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .strip img, .strip video { max-height: 130px; max-width: 220px; }
  li.rule { border-bottom: 0; padding: 16px 12px 6px; color: var(--pw-muted); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
  li.rule::after { content: ""; flex: 1; height: 1px; background: var(--pw-border); }
  .unplaced li { color: var(--pw-muted); }
`);

/**
 * `<pairwise-ranking>` — the ranking, best first: shared ranks for ties, tier rules, rows that
 * expand to show media and description, a title filter, and bench / edit / open actions per row.
 * Mid-sort it shows the placed part as provisional and lists the rest. Set `query`, or call
 * `expand()` / `expandAll()` / `collapseAll()`, from code; `no-search` hides its own search box.
 * Fires `pairwise-edit` and `pairwise-benched`.
 */
export class PairwiseRanking extends PairwiseElement {
  #open = new Set<string>();
  #query = "";
  readonly #lightbox: Lightbox;

  constructor() {
    super();
    this.root.innerHTML = `
      <p part="partial" class="banner info" hidden></p>
      <div class="tools">
        <input part="search" type="search" placeholder="Filter by title…" aria-label="Filter by title">
        <span part="count" class="muted"></span>
        <button part="clear" hidden>Clear</button>
        <button part="expand-all">Expand all</button>
        <button part="collapse-all">Collapse all</button>
      </div>
      <p part="note" class="muted" hidden></p>
      <ol part="list"></ol>
      <ul part="unplaced" class="unplaced"></ul>
      ${Lightbox.html}`;
    this.#lightbox = new Lightbox(this.root);
    const $ = (p: string) => this.root.querySelector<HTMLInputElement>(`[part=${p}]`)!;
    $("search").oninput = () => { this.query = $("search").value; };
    $("clear").onclick = () => { this.query = ""; };
    $("expand-all").onclick = () => this.expandAll();
    $("collapse-all").onclick = () => this.collapseAll();
    $("list").onclick = (e) => this.#click(e);
  }

  protected styles() { return [mediaStyle, style]; }

  static get observedAttributes() { return ["no-search"]; }
  attributeChangedCallback(): void { this.render(); }

  /** The title filter. Display only: it hides rows, never changes a rank. */
  get query(): string { return this.root.querySelector<HTMLInputElement>("[part=search]")!.value; }
  set query(q: string) {
    this.root.querySelector<HTMLInputElement>("[part=search]")!.value = q;
    this.#query = q.trim().toLowerCase();
    this.#filter();
  }

  /** Open (or close) the detail row of `list.items[index]`. */
  expand(index: number, on = true): void {
    const id = idOf(this.sorter!.list.items[index]);
    if (on) this.#open.add(id); else this.#open.delete(id);
    this.render();
  }

  /** Open every row that has media or a description. */
  expandAll(): void {
    this.#open = new Set(this.sorter!.ranking().filter((r) => detailed(r.item)).map((r) => idOf(r.item)));
    this.render();
  }

  collapseAll(): void {
    this.#open.clear();
    this.render();
  }

  render(): void {
    const s = this.sorter, $ = (p: string) => this.root.querySelector<HTMLElement>(`[part=${p}]`)!;
    const rows = s?.ranking() ?? [];
    const { priority = [], combine = "order" } = s?.list ?? {};
    const partial = !!s && !s.complete;
    const at = s?.placement();
    // A host with its own search box (the whole app, say) sets no-search.
    for (const p of ["search", "count"]) $(p).hidden = this.hasAttribute("no-search");
    $("partial").hidden = !partial;
    if (at) $("partial").textContent = `Sorting in progress — ${at.placed} of ${at.total} placed so far. `
      + "This order is provisional; the rest slot in as you keep answering.";
    $("unplaced").innerHTML = partial ? s!.unplaced().map((it) => `<li>${esc(it.title)}</li>`).join("") : "";
    $("note").hidden = !priority.length;
    $("note").textContent = combine === "weights"
      ? "Tiers are on, so positions across tiers come from the weights you set, not from answers you gave. Within a tier the order is entirely yours."
      : "Tiers are on, so cross-tier positions come from the tier order you set, not from answers you gave. Within a tier the order is entirely yours.";

    let lastTier: number | null = null;
    $("list").innerHTML = rows.map(({ item: it, index, rank, tied }) => {
      let rule = "";
      if (priority.length && combine === "order") {
        const tier = tierOf(it, priority);
        if (tier !== lastTier) rule = `<li part="rule" class="rule">${esc(tierName(tier, priority))}</li>`;
        lastTier = tier;
      }
      const id = idOf(it), open = this.#open.has(id), name = esc(it.title);
      const title = detailed(it)
        ? `<button part="title" class="title" data-toggle="${index}" aria-expanded="${open}">${name}</button>`
        : `<span part="title" class="title">${name}</span>`;
      return `${rule}<li part="row" class="${tied ? "tied" : ""}" data-title="${esc(it.title.toLowerCase())}">
        <span part="rank" class="rank">${tied ? "=" : rank}</span>${title}
        ${it.tags.length ? `<span class="tags">${it.tags.map((t) => tagChip(t, priority)).join("")}</span>` : ""}
        <span class="acts">
          ${it.url ? `<a part="open" href="${esc(it.url)}" target="_blank" rel="noopener" aria-label="Open ${name} in a new tab">↗</a>` : ""}
          <button part="edit" data-edit="${index}" aria-label="Edit ${name}">✎</button>
          <button part="bench" data-bench="${index}" aria-label="Bench ${name}">Bench</button>
        </span>
        ${open ? `<div part="detail" class="detail" data-images="${esc(JSON.stringify(imagesOf(it)))}">
          <div class="strip">${it.media.map(mediaHTML).join("")}</div>${it.desc ? `<p class="muted">${esc(it.desc)}</p>` : ""}</div>` : ""}
      </li>`;
    }).join("");
    this.#filter();
  }

  /** Display only: hides rows whose title does not match, never changes a rank. */
  #filter(): void {
    const list = this.root.querySelector<HTMLElement>("[part=list]")!, q = this.#query;
    const rows = [...list.children] as HTMLElement[];
    for (const li of rows) if (!li.matches(".rule")) li.hidden = !!q && !li.dataset.title!.includes(q);
    // A rule whose whole tier is filtered away would read as an empty section.
    rows.forEach((li, i) => {
      if (!li.matches(".rule")) return;
      let j = i + 1, any = false;
      for (; j < rows.length && !rows[j]!.matches(".rule"); j++) any ||= !rows[j]!.hidden;
      li.hidden = !any;
    });
    const items = rows.filter((li) => !li.matches(".rule"));
    list.classList.toggle("filtering", !!q);
    this.root.querySelector("[part=count]")!.textContent = q ? `showing ${items.filter((li) => !li.hidden).length} of ${items.length}` : "";
    this.root.querySelector<HTMLElement>("[part=clear]")!.hidden = !q || this.hasAttribute("no-search");
  }

  #click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const img = t.closest("img");
    if (img) {
      this.#lightbox.show(img.getAttribute("src")!, JSON.parse(img.closest<HTMLElement>("[part=detail]")!.dataset.images!));
      return;
    }
    const d = t.closest("button")?.dataset;
    if (!d) return;
    // Attributes carry item INDICES: an id holds a NUL separator, which HTML parsing rewrites.
    const it = (i: string) => idOf(this.sorter!.list.items[Number(i)]);
    if (d.toggle) this.expand(Number(d.toggle), !this.#open.has(it(d.toggle)));
    else if (d.edit) this.fire("pairwise-edit", { index: Number(d.edit) });
    else if (d.bench) {
      this.sorter!.bench([it(d.bench)]);
      // Tells the whole app to keep the list on screen if benching raises a new question.
      this.fire("pairwise-benched");
    }
  }
}

const detailed = (it: Item) => it.media.length > 0 || !!it.desc;
