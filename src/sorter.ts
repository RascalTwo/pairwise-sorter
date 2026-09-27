// A live sorting session over one list: the open question, answering, undo, the bench,
// editing, tiers and resolving. Everything a UI does, with no UI — the web components and
// the console API both drive this.
//
// The sort is deterministic, so every change just re-runs it from the log: answers replay
// instantly and the sort stops at the first pair nobody has answered yet. Undo, reload,
// benching, editing and retiering all fall out of that; nothing serialises the recursion.

import {
  disagreements, minimiseDisagreements, placement, preferences, rankRows, tieredBudget, tierOverrides, weightedOrder,
  type RankRow,
} from "./analysis.ts";
import {
  findConflicts, flipOfIds, migrateId, orient, pairKeyOf, retireLog, sortIndices, tierVerdict, type Combine, type LogEntry,
  type Verdict,
} from "./engine.ts";
import { idOf, idParts, item, SEP, tagOf, type Item } from "./item.ts";
import { emptyList, type List } from "./store.ts";

/** A pair being asked: indices into `list.items`, shown as left (`a`) and right (`b`). */
export interface Question { a: number; b: number }
export interface Comparison {
  index: number;
  a: { title: string; url: string };
  b: { title: string; url: string };
  verdict: Verdict;
  /** Filled in from an earlier order by `retire`, not given by a person. */
  implied: boolean;
  /** Why the ranking contradicts this answer, or null when it does not. */
  why: string | null;
}
export type Tier = string | { tag?: string; name?: string; weight?: number };

const VERDICTS = new Set([-1, 0, 1]);

/**
 * Events: `question` (a new pair is waiting), `change` (the list changed — save it),
 * `done` (a complete ranking is ready), `upcoming` (detail: item indices that may be asked
 * next, for preloading their media).
 */
export class Sorter extends EventTarget {
  /** The open list. Mutated in place; save it on `change`. */
  list!: List;
  /** The pair waiting for an answer, or null. */
  question: Question | null = null;

  #token = 0;
  #pending: ((v: Verdict) => void) | null = null;
  #answers = new Map<string, Verdict>();
  #order: number[] = [];
  #partial: { placed: number[]; remaining: number[] } = { placed: [], remaining: [] };
  #conflicts = new Map<number, string>();
  #finished = false;
  #quiet = false;
  #waiters: (() => void)[] = [];

  constructor(list: List = emptyList("Untitled")) {
    super();
    this.open(list);
  }

  /** Switch to a list, abandoning any sort in progress. Malformed saved answers are dropped. */
  open(list: List): void {
    list.log = (Array.isArray(list.log) ? list.log : []).filter(
      (e) => Array.isArray(e) && (e.length === 2 || (e.length === 3 && e[2] === true))
        && typeof e[0] === "string" && e[0].includes(SEP) && VERDICTS.has(e[1]),
    );
    this.list = list;
    this.#run();
  }

  /** Resolves once the sorter is waiting on a question or has finished. */
  settled(): Promise<void> {
    return new Promise((r) => (this.#quiet ? r() : this.#waiters.push(r)));
  }

  /** True once a full ranking exists and nothing is being asked. */
  get complete(): boolean { return this.#finished; }

  /** Answer the open question: -1 left wins, 1 right wins, 0 equal. Resolves when settled. */
  answer(v: Verdict): Promise<void> {
    const p = this.#pending;
    if (!p) throw new Error("nothing is being asked right now");
    this.#pending = null;
    this.question = null;
    this.#quiet = false;
    p(v);
    return this.settled();
  }

  /** Drop the most recent answer; its question comes back. */
  undo(): Promise<void> {
    if (this.list.log.length) this.#change(() => this.list.log.pop());
    return this.settled();
  }

  /** Forget one answer by its index in {@link comparisons}. */
  deleteAnswer(i: number): Promise<void> {
    if (!Number.isInteger(i) || i < 0 || i >= this.list.log.length) throw new Error(`no comparison at index ${i}`);
    return this.#change(() => this.list.log.splice(i, 1));
  }

  /** Clear every answer. Items and the bench are untouched. */
  resetAnswers(): Promise<void> {
    return this.#change(() => { this.list.log = []; });
  }

  /** Take items out of the ranking. Their answers are kept. */
  bench(ids: readonly string[]): Promise<void> {
    return this.#change(() => { this.list.benched = [...new Set([...this.list.benched, ...ids])]; });
  }

  /** Put a benched item back; its kept answers restore its place. */
  subIn(id: string): Promise<void> {
    if (!this.list.benched.includes(id)) throw new Error("that item is not benched");
    return this.#change(() => { this.list.benched = this.list.benched.filter((b) => b !== id); });
  }

  subAll(): Promise<void> {
    return this.#change(() => { this.list.benched = []; });
  }

  /**
   * Remove items for good — finished work, say — WITHOUT re-asking anything. An item that others
   * were compared against instead of each other takes those links with it, so replaying would
   * need new questions; but the order before the removal already settles every pair among the
   * items it had placed. Those questions are answered from it and logged as implied (ties stay
   * ties). Items it had not placed yet are still asked about for real.
   */
  retire(ids: readonly string[]): Promise<void> {
    const l = this.list, have = new Set(l.items.map(idOf));
    const missing = ids.find((id) => !have.has(id));
    if (missing !== undefined) throw new Error(`no item with id ${missing}`);
    const gone = new Set(ids);
    return this.#change(() => {
      // Over the items being sorted: a benched item is out of the order, so it settles nothing.
      l.log = retireLog(this.live().map((i) => l.items[i]!), l.log, ids, l.priority);
      l.items = l.items.filter((it) => !gone.has(idOf(it)));
      l.log = l.log.filter(([k]) => !k.split(SEP).some((id) => gone.has(id)));
      l.benched = l.benched.filter((id) => !gone.has(id));
      this.#pruneTiers();
    });
  }

  /** Benched items that still exist. */
  benchedItems(): Item[] {
    const byId = new Map(this.list.items.map((it) => [idOf(it), it]));
    return this.list.benched.flatMap((id) => byId.get(id) ?? []);
  }

  /**
   * Replace the items. Survivors keep their EXISTING order and new items append — that
   * append-stability is what lets every earlier answer replay, so adding one item costs
   * ~log2 n questions. Only deleted items lose their answers.
   */
  setItems(next: readonly Item[]): { dupes: string[]; dropped: number } {
    const byId = new Map<string, Item>(), dupes: string[] = [];
    for (const it of next) {
      const id = idOf(it);
      if (byId.has(id)) dupes.push(it.title); else byId.set(id, it);
    }
    if (byId.size < 2) throw new Error("need at least 2 distinct items");
    const l = this.list;
    const old = new Set(l.items.map(idOf));
    const before = l.log.length;
    this.#change(() => {
      l.items = l.items.filter((it) => byId.has(idOf(it))).map((it) => byId.get(idOf(it))!)
        .concat([...byId.values()].filter((it) => !old.has(idOf(it))));
      const kept = new Set(l.items.map(idOf));
      l.log = l.log.filter(([k]) => k.split(SEP).every((id) => kept.has(id)));
      l.benched = l.benched.filter((id) => kept.has(id));
      this.#pruneTiers();
    });
    return { dupes: [...new Set(dupes)], dropped: before - l.log.length };
  }

  /**
   * Change an item's fields. A rename CARRIES its answers across (see `migrateId`); a rename
   * onto another existing item would merge two histories, so it is refused.
   */
  editItem(index: number, patch: Partial<Omit<Item, "key">>): Promise<void> {
    const l = this.list, cur = l.items[index];
    if (!cur) throw new Error(`no item at index ${index}`);
    const next = item(
      String(patch.title ?? cur.title).trim(), patch.url ?? cur.url, patch.media ?? cur.media,
      patch.desc ?? cur.desc, patch.tags ?? cur.tags, cur.key,
    );
    if (!next.title) throw new Error("a title is required");
    const oldId = idOf(cur), newId = idOf(next);
    if (oldId !== newId && l.items.some((o, j) => j !== index && idOf(o) === newId))
      throw new Error("another item already has that title and link");
    return this.#change(() => {
      const benched = new Set(l.benched);
      migrateId(l.log, benched, oldId, newId);
      l.benched = [...benched];
      l.items[index] = next;
      this.#pruneTiers();
    });
  }

  /** Every tag on any item, sorted. */
  tags(): string[] {
    return [...new Set(this.list.items.flatMap((it) => it.tags))].sort();
  }

  /**
   * Set the tiers, best first — tags or `{tag, weight}`. Cross-tier pairs are then answered from
   * this order instead of being asked. `[]` turns tiers off.
   */
  setPriority(tiers: readonly Tier[]): Promise<void> {
    const seen = new Map<string, number>();
    for (const e of tiers) {
      const tag = tagOf(typeof e === "string" ? e : e.tag ?? e.name ?? "");
      const w = typeof e === "object" ? Number(e.weight) : 1;
      if (tag && !seen.has(tag)) seen.set(tag, w > 0 ? w : 1);
    }
    const known = new Set(this.tags());
    const unknown = [...seen.keys()].filter((t) => !known.has(t));
    if (unknown.length)
      throw new Error(`no item carries ${unknown.map((t) => "#" + t).join(", ")} — have: ${[...known].join(", ") || "none"}`);
    return this.#change(() => {
      this.list.priority = [...seen.keys()];
      this.list.weights = [...seen.values()];
    });
  }

  /** "order": a higher tier wins outright · "weights": tiers contribute in proportion. */
  setCombine(mode: Combine): Promise<void> {
    if (mode !== "order" && mode !== "weights") throw new Error("combine expects 'order' or 'weights'");
    return this.#change(() => { this.list.combine = mode; });
  }

  /** Your answers that go against the tier order. Yours win until dropped. */
  overrides(): Comparison[] {
    const all = this.comparisons();
    return tierOverrides(this.list.items, this.list.log, this.list.priority).map((n) => all[n]!);
  }

  /** Forget the answers that go against the tiers, letting the tiers decide those pairs. */
  dropOverrides(): Promise<void> {
    const drop = new Set(tierOverrides(this.list.items, this.list.log, this.list.priority));
    return this.#change(() => { this.list.log = this.list.log.filter((_, n) => !drop.has(n)); });
  }

  /** Indices of items in the ranking (not benched). */
  live(): number[] {
    const benched = new Set(this.list.benched);
    return this.list.items.map((_, i) => i).filter((i) => !benched.has(idOf(this.list.items[i])));
  }

  /** Worst-case questions for the whole sort, honest about tiers. */
  budget(): number {
    return tieredBudget(this.list.items, this.live(), this.list.priority);
  }

  /** How much of the ranking is already final. */
  placement() {
    return placement(this.#partial);
  }

  /** The ranking with shared ranks for ties — final once {@link complete}, else the placed part. */
  ranking(): (RankRow & { item: Item })[] {
    const src = this.#finished ? this.#order : this.#partial.placed;
    return rankRows(src, this.list.items, this.list.log).rows.map((r) => ({ ...r, item: this.list.items[r.index]! }));
  }

  /** Items with no position yet while a sort is running — empty once complete. */
  unplaced(): Item[] {
    return this.#partial.remaining.map((i) => this.list.items[i]!);
  }

  /** Every answer given, as readable pairs; `why` is set when the ranking contradicts it. */
  comparisons(): Comparison[] {
    const byId = new Map(this.list.items.map((it) => [idOf(it), it]));
    const ref = (id: string) => {
      const it = byId.get(id);
      return it ? { title: it.title, url: it.url } : idParts(id);
    };
    return this.list.log.map(([k, verdict, implied], index) => {
      const [x = "", y = ""] = k.split(SEP);
      return { index, a: ref(x), b: ref(y), verdict, implied: implied === true, why: this.#conflicts.get(index) ?? null };
    });
  }

  /**
   * Reorder to contradict as few answers as possible (best-effort local search, not a proof
   * of the minimum). Lasts until the next change re-runs the sort.
   */
  resolve(): { before: number; after: number } {
    const { items } = this.list, pref = preferences(this.list.log);
    const before = disagreements(this.#order, items, pref);
    const next = minimiseDisagreements(this.#order, items, pref);
    const after = disagreements(next, items, pref);
    if (after >= before) return { before, after: before };
    this.#order = next;
    this.#conflicts = findConflicts(this.list.log, rankRows(next, items, this.list.log).rankById);
    this.#emit("done");
    return { before, after };
  }

  #change(mutate: () => void): Promise<void> {
    mutate();
    // Run first: it clears the old question synchronously, so a listener rendering on
    // `change` never sees indices into items that have just gone.
    this.#run();
    this.#emit("change");
    return this.settled();
  }

  #pruneTiers(): void {
    const l = this.list, tagged = new Set(l.items.flatMap((it) => it.tags));
    l.weights = l.priority.map((t, i): [string, number] => [t, l.weights[i] ?? 1]).filter(([t]) => tagged.has(t)).map(([, w]) => w);
    l.priority = l.priority.filter((t) => tagged.has(t));
  }

  #emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #settle(): void {
    this.#quiet = true;
    for (const w of this.#waiters.splice(0)) w();
  }

  async #run(): Promise<void> {
    const my = ++this.#token;
    this.#pending = null;
    this.question = null;
    this.#quiet = false;
    this.#finished = false;
    this.#order = [];
    this.#partial = { placed: [], remaining: [] };
    this.#conflicts = new Map();
    this.#answers = new Map(this.list.log.map(([k, v]) => [k, v]));
    // A microtask first, so a host that attaches listeners right after construction or a
    // change still hears the first question.
    await null;
    if (my !== this.#token) return;
    const { items } = this.list;
    const sorted = await sortIndices(
      this.live(),
      (a, b) => this.#cmp(a, b, my),
      ({ placed, remaining, next }) => {
        this.#partial = { placed, remaining };
        if (next !== undefined) this.#emit("upcoming", [next]);
      },
      ({ out, lo, hi, mid }) => this.#emit("upcoming", [out[(lo + mid) >> 1], out[(mid + 1 + hi) >> 1]].filter((i) => i !== undefined)),
    );
    // A superseded run never gets here: its pending question is dropped, not answered.
    this.#order = weightedOrder(sorted, items, this.list.priority, this.list.weights, this.list.combine);
    this.#partial = { placed: [...sorted], remaining: [] };
    this.#conflicts = findConflicts(this.list.log, rankRows(this.#order, items, this.list.log).rankById);
    this.#finished = true;
    this.#emit("done");
    this.#settle();
  }

  #cmp(a: number, b: number, my: number): Verdict | Promise<Verdict> {
    const { items } = this.list;
    const ia = idOf(items[a]), ib = idOf(items[b]);
    const k = pairKeyOf(ia, ib), flip = flipOfIds(ia, ib);
    // Your own answer first, so a direct answer beats the tier order — the escape hatch for
    // promoting one item across the divide.
    const known = this.#answers.get(k);
    if (known !== undefined) return orient(known, flip);
    const tier = tierVerdict(items[a]!, items[b]!, this.list.priority);
    if (tier !== null) return tier;
    return new Promise((resolve) => {
      this.#pending = (v) => {
        const stored = orient(v, flip);
        this.#answers.set(k, stored);
        this.list.log.push([k, stored]);
        this.#emit("change");
        resolve(v);
      };
      this.question = { a, b };
      this.#emit("question", this.question);
      this.#settle();
    });
  }
}
