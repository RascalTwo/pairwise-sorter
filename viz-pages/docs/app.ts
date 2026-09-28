    import { arrowMarkers, connect, labelBox, stepper, $, esc, type Box } from "/_kit/viz.js";
    declare const hljs: typeof import("highlight.js").default;
    type Verdict = -1 | 0 | 1;
    /** The slice of the library (./dist/index.js, built, not in git) this page uses. */
    interface Pairwise {
      sortIndices(arr: readonly number[], cmp: (a: number, b: number) => Verdict | Promise<Verdict>,
        onProgress?: (p: { placed: number[]; remaining: number[] }) => void,
        onProbe?: (p: { out: readonly number[]; lo: number; hi: number; mid: number }) => void): Promise<number[]>;
      budgetFor(n: number): number;
      Sorter: new (list: object) => unknown;
      emptyList(name: string): object;
      item(title: string): unknown;
    }
    interface Step {
      kind: "take" | "ask" | "answer" | "place" | "done";
      placed: readonly number[];
      item: number | null | undefined;
      lo?: number | undefined; hi?: number | undefined; mid?: number; verdict?: Verdict; was?: [number | undefined, number | undefined]; at?: number;
    }
    type Entry = [id: string, label: string, what: string, api: string[]];
    // The library is loaded at RUNTIME, never bundled into the published page: a bundled copy
    // would silently keep demoing old code whenever the library changed without a re-publish.
    // Locally (`bun run docs:dev`) it sits in ./dist/ beside this page; on the site this page is
    // /docs/ and CI builds the library into /dist/. A computed specifier is also what stops
    // `viz publish` from bundling it.
    const lib = location.pathname.includes("/viz-pages/") ? "./dist/" : "../dist/";
    const pw: Pairwise = await import(lib + "index.js");
    await import(lib + "element/index.js");

    // ── 1. binary insertion, recorded from the real sortIndices ─────────
    // Every node is created once and only MOVED between steps, so a CSS transition animates
    // each change and stepping backwards animates too. A step is declarative: state is a
    // function of the step index alone.
    const COFFEES: [string, number][] = [["Mocha", 4], ["Cold brew", 7], ["Latte", 3], ["Flat white", 8], ["Americano", 2], ["Cortado", 6], ["Drip", 1], ["Espresso", 5]];
    const better = (a: number, b: number): Verdict => (COFFEES[a]![1] > COFFEES[b]![1] ? -1 : 1);
    const steps: Step[] = [];
    let cur: number | null | undefined = null;
    await pw.sortIndices(COFFEES.map((_, i) => i), (a, b) => {
      const v = better(a, b), ask = steps.at(-1)!;
      const [lo, hi] = v < 0 ? [ask.lo, ask.mid] : [ask.mid! + 1, ask.hi];
      steps.push({ ...ask, kind: "answer", verdict: v, lo, hi, was: [ask.lo, ask.hi] });
      return v;
    }, ({ placed, remaining }) => {
      if (cur !== null) steps.push({ kind: "place", placed, item: cur, at: placed.indexOf(cur!) });
      cur = remaining[0];
      steps.push({ kind: "take", placed, item: cur });
    }, ({ out, lo, hi, mid }) => {
      steps.push({ kind: "ask", placed: [...out], item: cur, lo, hi, mid });
    });
    const final = await pw.sortIndices(COFFEES.map((_, i) => i), better);
    steps.push({ kind: "place", placed: final, item: cur, at: final.indexOf(cur!) });
    steps.push({ kind: "done", placed: final, item: null });
    const questions = steps.filter((s) => s.kind === "ask").length;

    const COL_X = 300, COL_W = 250, ROW = 74, TOP = 40, BOX_H = 44, NEW_X = 660, N = COFFEES.length;
    const rowY = (k: number) => TOP + k * ROW;
    // A place the item could go: the gap ABOVE row k (k = n is below the last row).
    const slotY = (k: number) => rowY(k) - (ROW - BOX_H) / 2;
    const svg = $<SVGSVGElement>("#howSvg")!;
    svg.innerHTML = `
      <text x="${COL_X - 70}" y="${TOP + 27}" text-anchor="end" font-size="13" fill="var(--muted)">best</text>
      <text x="${COL_X - 70}" y="${rowY(N - 1) + 27}" text-anchor="end" font-size="13" fill="var(--muted)">worst</text>
      <defs><marker id="rk" viewBox="0 0 10 10" refX="5" refY="9" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,0 L5,10z" fill="var(--border)"/></marker></defs>
      <line x1="${COL_X - 58}" y1="${TOP + 8}" x2="${COL_X - 58}" y2="${rowY(N - 1) + 36}" stroke="var(--border)" stroke-width="2" marker-end="url(#rk)"/>
      ${Array.from({ length: N + 1 }, (_, k) => `<g class="slot" id="s${k}" style="opacity:0" data-viz-id="slot-${k}" data-label="possible place #${k + 1}">
        <line x1="0" x2="${COL_W}" y1="0" y2="0" stroke="var(--warn)" stroke-width="3" stroke-dasharray="7 6"/>
        <circle cx="-10" cy="0" r="5" fill="var(--warn)"/></g>`).join("")}
      <g id="link" style="opacity:0"><line class="grow" x1="0" x2="${NEW_X - COL_X - COL_W}" y1="0" y2="0" stroke="var(--warn)" stroke-width="2.5" stroke-dasharray="5 4"/></g>
      ${COFFEES.map(([name], i) => `<g class="node" id="n${i}" data-viz-id="coffee-${i}" data-label="${esc(name)}" style="opacity:0">
        <rect width="${COL_W}" height="${BOX_H}" rx="9" stroke="var(--border)"/>
        <text x="16" y="28" font-size="16">${esc(name)}</text>
        <text class="rank" x="-22" y="28" text-anchor="end" font-size="13" fill="var(--muted)"></text>
        <g class="better" style="opacity:0"><rect x="${COL_W - 92}" y="9" width="84" height="26" rx="13" fill="var(--good)"/>
          <text x="${COL_W - 50}" y="27" text-anchor="middle" font-size="13" font-weight="700" fill="#04140a">✓ better</text></g></g>`).join("")}
      <text class="count" id="count" x="${COL_W / 2}" y="${BOX_H + 22}" text-anchor="middle" font-size="13" fill="var(--warn)" style="opacity:0"></text>`;
    const node = (i: number) => svg.querySelector<SVGGElement>(`#n${i}`)!;
    /**
     * Move and show/hide an element. Something APPEARING jumps straight to its place with no
     * transition — otherwise it would visibly fly in from wherever it was last parked.
     */
    function put(el: SVGElement, x: number, y: number, opacity: number) {
      const t = `translate(${x}px, ${y}px)`;
      if (Number(el.style.opacity || 0) === 0 && opacity > 0) {
        el.style.transition = "none";
        el.style.transform = t;
        el.getBoundingClientRect();
        el.style.transition = "";
      } else el.style.transform = t;
      el.style.opacity = String(opacity);
    }
    const places = (n: number) => (n === 1 ? "1 possible place" : `${n} possible places`);

    function drawHow(i: number) {
      const st = steps[i]!;
      const asking = st.kind === "ask" || st.kind === "answer";
      const placed = st.placed, pos = new Map(placed.map((idx, k) => [idx, k]));
      // Rows the item could still land among (lo..hi-1) and places it could still go (lo..hi).
      const [lo, hi] = asking ? [st.lo!, st.hi!] : st.kind === "take" ? [0, placed.length] : [st.at ?? 0, st.at ?? 0];
      const winner = st.kind === "answer" ? (st.verdict! < 0 ? st.item : placed[st.mid!]) : null;
      let newPos: [number, number] | null = null;

      COFFEES.forEach((_, c) => {
        const el = node(c), rect = el.querySelector("rect")!, [title, rank] = el.querySelectorAll<SVGTextElement>(":scope > text") as unknown as [SVGTextElement, SVGTextElement];
        let x = NEW_X, y = rowY(0), op = 0, fill = "var(--panel-2)", ink = "var(--text)";
        if (pos.has(c)) {
          const k = pos.get(c)!;
          x = COL_X; y = rowY(k);
          op = asking && (k < lo || k >= hi) && k !== st.mid ? 0.35 : 1;
          if (asking && k === st.mid) { fill = "var(--warn)"; ink = "#1a1300"; }
          rank.textContent = `#${k + 1}`;
        } else rank.textContent = "";
        if (c === st.item) {
          fill = "var(--accent)"; ink = "#06101d"; op = 1;
          if (st.kind !== "place") { x = NEW_X; y = asking ? rowY(st.mid!) : rowY(0); newPos = [x, y]; }
        }
        rect.style.fill = fill;
        title.style.fill = ink;
        el.querySelector<SVGGElement>(".better")!.style.opacity = String(c === winner ? 1 : 0);
        put(el, x, y, op);
      });

      // Possible places: lit inside the open range, faded once ruled out, gone when not in play.
      const inPlay = st.kind === "take" || asking || st.kind === "place";
      for (let k = 0; k <= N; k++) {
        const slot = svg.querySelector<SVGGElement>(`#s${k}`)!, exists = k <= placed.length - (st.kind === "place" ? 1 : 0);
        const open = k >= lo && k <= hi;
        const op = !inPlay || !exists || st.kind === "place" ? 0 : open ? 1 : 0.18;
        const colour = !open ? "var(--muted)" : lo === hi ? "var(--good)" : "var(--warn)";
        slot.querySelectorAll<SVGElement>("line, circle").forEach((m) => { m.style.stroke = m.style.fill = colour; });
        slot.querySelector("line")!.style.fill = "none";
        put(slot, COL_X, slotY(k), op);
      }

      const link = svg.querySelector<SVGGElement>("#link")!, grow = link.querySelector("line")!;
      if (asking) {
        put(link, COL_X + COL_W, rowY(st.mid!) + BOX_H / 2, 1);
        grow.style.stroke = st.kind === "answer" ? "var(--good)" : "var(--warn)";
        if (st.kind === "ask") { grow.style.transition = "none"; grow.style.transform = "scaleX(0)"; grow.getBoundingClientRect(); grow.style.transition = ""; }
        grow.style.transform = "scaleX(1)";
      } else link.style.opacity = "0";

      const count = svg.querySelector<SVGTextElement>("#count")!, open = hi - lo + 1;
      if (newPos && st.kind !== "done") {
        count.textContent = places(open);
        count.style.fill = open === 1 ? "var(--good)" : "var(--warn)";
        put(count, newPos[0], newPos[1], 1);
      } else count.style.opacity = "0";

      const name = (k: number) => `<b>${esc(COFFEES[k]![0])}</b>`;
      const range = open === 1 ? `that leaves <b>1 possible place</b>: #${lo + 1}` : `that leaves <b>${places(open)}</b>, #${lo + 1}–#${hi + 1}`;
      $("#howSay")!.innerHTML = {
        take: () => placed.length
          ? `Next up: ${name(st.item!)}. With ${placed.length} already ranked it has <b>${places(placed.length + 1)}</b> — `
            + (placed.length === 1 ? `above or below ${name(placed[0]!)}.` : "above them, between any two, or below them.")
          : `${name(st.item!)} goes first: with nothing ranked yet there is only <b>1 possible place</b>.`,
        ask: () => `Is ${name(st.item!)} better than ${name(placed[st.mid!]!)}? It is compared with the <b>middle</b> of what's still open, so either answer rules out about half the places.`,
        answer: () => st.verdict! < 0
          ? `<b>Yes</b> — ${name(st.item!)} is better, so it goes above ${name(placed[st.mid!]!)}; ${range}.`
          : `<b>No</b> — ${name(placed[st.mid!]!)} is better, so ${name(st.item!)} goes below it; ${range}.`,
        place: () => `One place left — ${name(st.item!)} lands at <b>#${st.at! + 1}</b>`
          + (st.at! < placed.length - 1 ? " and everything under it moves down." : "."),
        done: () => `Done: 8 items ranked with <b>${questions}</b> questions. Asking about every pair would have taken 28.`,
      }[st.kind]();
      $("#howAt")!.textContent = `step ${i + 1} / ${steps.length}`;
    }
    const how = stepper({ n: steps.length, onStep: drawHow, hashKey: "how", target: $("#howFig")! });
    $("#howPrev")!.onclick = () => how.prev();
    $("#howNext")!.onclick = () => how.next();
    let playing: ReturnType<typeof setInterval> | null = null;
    $("#howPlay")!.onclick = () => {
      if (playing) { clearInterval(playing); playing = null; $("#howPlay")!.textContent = "▶ Play"; return; }
      if (how.current === steps.length - 1) how.go(0);
      $("#howPlay")!.textContent = "❚❚ Pause";
      playing = setInterval(() => {
        if (how.current === steps.length - 1) return $("#howPlay")!.click();
        how.next();
      }, 1300);
    };

    // ── 2. questions against n ───────────────────────────────────────────
    const cost = $<SVGSVGElement>("#costSvg")!, CW = 1000, CH = 360, L = 70, R = 20, T = 20, B = 40, NMAX = 200;
    const xs = (n: number) => L + ((n - 2) / (NMAX - 2)) * (CW - L - R);
    const ys = (v: number) => CH - B - (Math.log10(Math.max(v, 1)) / Math.log10(20000)) * (CH - T - B);
    const series = [
      { id: "pairs", color: "var(--danger)", f: (n: number) => (n * (n - 1)) / 2, label: "every pair" },
      { id: "insert", color: "var(--accent)", f: (n: number) => pw.budgetFor(n), label: "binary insertion" },
      { id: "add", color: "var(--good)", f: (n: number) => Math.ceil(Math.log2(n + 1)), label: "adding one item" },
    ];
    function drawCost(n: number) {
      let g = "";
      for (const v of [1, 10, 100, 1000, 10000]) g += `<line x1="${L}" x2="${CW - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--border)"/><text x="${L - 8}" y="${ys(v) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${v.toLocaleString()}</text>`;
      for (const t of [2, 50, 100, 150, 200]) g += `<text x="${xs(t)}" y="${CH - B + 20}" text-anchor="middle" font-size="12" fill="var(--muted)">${t}</text>`;
      g += `<text x="${(L + CW - R) / 2}" y="${CH - 4}" text-anchor="middle" font-size="12" fill="var(--muted)">items in the list (n)</text>`;
      g += `<text transform="translate(16 ${(T + CH - B) / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="var(--muted)">questions asked</text>`;
      for (const s of series) {
        const d = Array.from({ length: NMAX - 1 }, (_, i) => i + 2).map((k, i) => `${i ? "L" : "M"}${xs(k).toFixed(1)},${ys(s.f(k)).toFixed(1)}`).join("");
        g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" data-viz-id="line-${s.id}" data-label="${s.label}"/>`;
        g += `<circle cx="${xs(n)}" cy="${ys(s.f(n))}" r="5" fill="${s.color}" data-viz-id="dot-${s.id}" data-label="${s.label} at n=${n}: ${s.f(n)}"/>`;
      }
      g += `<line x1="${xs(n)}" x2="${xs(n)}" y1="${T}" y2="${CH - B}" stroke="var(--muted)" stroke-dasharray="3 4"/>`;
      cost.innerHTML = g;
      const [p, ins, add] = series.map((s) => s.f(n)) as [number, number, number];
      $("#costOut")!.innerHTML = `n = <b>${n}</b>: every pair <b>${p.toLocaleString()}</b> · binary insertion at most <b>${ins}</b> (${Math.round((ins / p) * 100)}%) · one more item <b>${add}</b>`;
    }
    $("#costN")!.oninput = (e) => drawCost(+(e.target as HTMLInputElement).value);
    drawCost(30);

    // ── 3. architecture ──────────────────────────────────────────────────
    const CORE: Entry[] = [
      ["item", "item · parse", "One item model — {title, url, media, desc, tags} — and every way to type it.", ["item()", "idOf()", "parseItems()", "toText()", "isMedia()"]],
      ["engine", "engine", "The decision log, tiers and the binary-insertion sort. createEngine() is the minimal API viz uses; replay() and retireLog() are the synchronous, pure versions a scheduler can call.", ["createEngine()", "replay()", "retireLog()", "sortIndices()", "tieClasses()", "findConflicts()", "migrateId()"]],
      ["analysis", "analysis", "Reads the log and derives things to show; never picks the next question.", ["weightedOrder()", "minimiseDisagreements()", "tierOverrides()", "tieredBudget()", "rankRows()"]],
      ["store", "store", "Saved lists, migrations that keep old data loading, the export format, and an optional localStorage helper.", ["localStore()", "migrate()", "importList()", "exportList()", "addList()"]],
      ["sorter", "Sorter", "The live session every element drives: the open question, answers, bench, edits, tiers, resolve — and retire(), which removes finished items without re-asking anything. Plus events.", ["question", "answer()", "undo()", "bench()", "retire()", "editItem()", "setPriority()", "resolve()"]],
    ];
    const ELS: Entry[] = [
      ["compare", "<pairwise-compare>", "The question: two cards with media, Choose and Equal, keyboard shortcuts, a lightbox. renderItem(item, box) draws items your way.", ["no-keyboard", "renderItem", "pairwise-edit"]],
      ["progress", "<pairwise-progress>", "Answers against the worst case, items placed, and an offer to stop once half are placed.", ["pairwise-stop"]],
      ["ranking", "<pairwise-ranking>", "The ranking with shared ranks for ties, tier rules, expandable rows and a title filter.", ["pairwise-edit"]],
      ["conflicts", "<pairwise-conflicts>", "Every answer, deletable; contradicted ones flagged; Resolve reorders to contradict as few as possible.", []],
      ["tiers", "<pairwise-tiers>", "Declare tags as tiers so cross-tier pairs are never asked.", []],
      ["weights", "<pairwise-weights>", "Combine tiers strictly, or by weight so a lower tier's best can outrank a higher tier's worst.", []],
    ];
    const APP: Entry[] = [
      ["app", "<pairwise-sorter>", "The whole app: several lists, items as text, the questions, the results, tiers, the bench and an editor. In memory, or storage-key=\"…\" for localStorage.", ["storage-key", ".library", "pairwise-change"]],
      ["console", "installConsole()", "Puts a scripting API on window, so DevTools or an agent can drive the app without clicking.", ["pairwiseSorter.help()"]],
    ];
    const boxes = new Map<string, Box & { label: string }>();
    const col = (list: Entry[], x: number, y0: number, w: number, h: number, gap: number) => list.forEach(([id, label], i) => boxes.set(id, { x, y: y0 + i * (h + gap), w, h, label }));
    col(CORE, 20, 50, 170, 56, 24);
    col(ELS, 265, 50, 190, 44, 22);
    col(APP, 510, 150, 170, 56, 40);
    const all = [...CORE, ...ELS, ...APP];
    let archOut = arrowMarkers({ ah: "var(--muted)" });
    archOut += `<text class="col" x="20" y="30">core · Node + browser</text><text class="col" x="265" y="30">elements</text><text class="col" x="510" y="130">whole app</text>`;
    const frame = { x: 250, y: 38, w: 220, h: 6 * 44 + 5 * 22 + 24 };
    archOut += `<rect class="frame" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}"/>`;
    archOut += `<path class="edge" d="${connect(boxes.get("sorter")!, frame)}" marker-end="url(#ah)"/>`;
    archOut += `<path class="edge" d="${connect(frame, boxes.get("app")!)}" marker-end="url(#ah)"/>`;
    archOut += `<path class="edge" d="${connect(boxes.get("app")!, boxes.get("console")!)}" marker-end="url(#ah)"/>`;
    for (const [id] of all) {
      const b = boxes.get(id)!;
      archOut += `<g class="box" data-id="${id}" data-viz-id="arch-${id}" data-label="${esc(b.label)}" tabindex="0" role="button"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>${labelBox(b, esc(b.label))}</g>`;
    }
    $("#archSvg")!.innerHTML = archOut;
    const showDetail = (id: string | undefined) => {
      const [, label, what, api] = all.find((e) => e[0] === id)!;
      $("#detail")!.innerHTML = `<h3>${esc(label)}</h3><p>${esc(what)}</p>${api.length ? `<p>${api.map((a) => `<code>${esc(a)}</code>`).join(" ")}</p>` : ""}<p class="muted"><a href="../api/">Full reference →</a></p>`;
      for (const g of document.querySelectorAll<SVGGElement>(".arch .box")) g.classList.toggle("on", g.dataset["id"] === id);
    };
    $("#archSvg")!.addEventListener("click", (e) => { const g = (e.target as Element).closest<SVGGElement>(".box"); if (g) showDetail(g.dataset["id"]); });
    $("#archSvg")!.addEventListener("keydown", (e) => { const g = (e.target as Element).closest<SVGGElement>(".box"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showDetail(g.dataset["id"]); } });
    showDetail("sorter");

    // ── 4. live elements sharing one Sorter ─────────────────────────────
    const SAMPLE = ["Flat white", "Cold brew", "Mocha", "Cortado", "Espresso", "Chai"];
    let live: unknown;
    const start = () => {
      live = new pw.Sorter({ ...pw.emptyList("Coffee"), items: SAMPLE.map((t) => pw.item(t)) });
      for (const id of ["liveCompare", "liveProgress", "liveRanking"]) (document.getElementById(id) as HTMLElement & { sorter: unknown }).sorter = live;
    };
    $("#liveReset")!.onclick = start;
    start();
    hljs.highlightAll();
