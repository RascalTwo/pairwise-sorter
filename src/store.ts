// Saved lists: the shape, the migrations that keep old data loading, the readable
// import/export format, and an optional localStorage adapter. The library never saves on
// its own — a host calls these, or stores the same plain objects wherever it likes.

import type { Combine, LogEntry, Verdict } from "./engine.ts";
import { idOf, idParts, item, SEP, tagOf, type Item } from "./item.ts";
import { fromJSON } from "./parse.ts";

/** One ranked list, as stored. */
export interface List {
  name: string;
  items: Item[];
  log: LogEntry[];
  /** Ids out of the ranking. Their answers are kept, so subbing back in re-asks nothing. */
  benched: string[];
  /** Tier tags, best first. Empty = tiers off. */
  priority: string[];
  /** Parallel to `priority`; only read when `combine` is "weights". */
  weights: number[];
  combine: Combine;
}

/** Every list, and which one is open. */
export interface Library {
  version: number;
  current: string | null;
  lists: Record<string, List>;
}

export const emptyList = (name: string): List =>
  ({ name, items: [], log: [], benched: [], priority: [], weights: [], combine: "order" });
export const emptyLibrary = (): Library => ({ version: SCHEMA, current: null, lists: {} });

type Loose = Record<string, any>;
const lists = (db: Loose): Loose[] => Object.values(db.lists ?? {});

// Ordered and APPEND-ONLY: MIGRATIONS[i] takes a library from version i to i+1. Never edit
// or reorder one after it ships — somebody's stored data has already run it. EVERY shape
// change needs one, even adding a field with a default: there is no second normalising pass.
const MIGRATIONS: ((db: Loose) => void)[] = [
  // 0 → 1: baseline. Data from before versioning predates `tags` on items and
  // `priority`/`weights`/`combine` on lists, in any combination.
  (db) => {
    for (const l of lists(db)) {
      l.items = (Array.isArray(l.items) ? l.items : [])
        .filter((it: unknown) => it && typeof it === "object")
        .map((it: Loose) => item(it.title ?? "", it.url ?? "", it.media ?? [], it.desc ?? "", it.tags ?? []));
      l.log = Array.isArray(l.log) ? l.log : [];
      l.priority = (Array.isArray(l.priority) ? l.priority : []).filter((t: unknown) => typeof t === "string");
      // Kept the same length as `priority` so the two can never slip apart.
      l.weights = l.priority.map((_: string, i: number) => (Number(l.weights?.[i]) > 0 ? Number(l.weights[i]) : 1));
      l.combine = l.combine === "weights" ? "weights" : "order";
    }
  },
  // 1 → 2: `removed` → `benched`.
  (db) => {
    for (const l of lists(db)) {
      l.benched = (Array.isArray(l.benched) ? l.benched : l.removed ?? []).filter((x: unknown) => typeof x === "string");
      delete l.removed;
    }
  },
];

/** The stored-data version this build writes. */
export const SCHEMA = MIGRATIONS.length;

/**
 * Bring a library up to {@link SCHEMA} in place; returns the steps applied. Data from a NEWER
 * build is left untouched (0 steps) — running older migrations over it would corrupt it.
 */
export function migrate(db: Library): number {
  const from = Number.isInteger(db.version) ? db.version : 0;
  if (from > SCHEMA) return 0;
  for (let v = from; v < SCHEMA; v++) MIGRATIONS[v]!(db);
  db.version = SCHEMA;
  return SCHEMA - from;
}

/** The parts of `Storage` the adapter uses. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Keep a library in `localStorage` (or anything with getItem/setItem). The default key is the
 * one the original pairwise-sorter page used, so its data loads straight in.
 */
export function localStore(key = "pairwise-sorter/v4", storage: StorageLike = globalThis.localStorage) {
  return {
    load(): Library {
      let d: Library | null = null;
      try { d = JSON.parse(storage.getItem(key) ?? "null"); } catch { /* corrupt — start fresh */ }
      if (!d || !d.lists || typeof d.lists !== "object") return emptyLibrary();
      migrate(d);
      return d;
    },
    save(lib: Library): void {
      // Never LOWERED: a stale tab must not relabel data a newer build wrote.
      lib.version = Math.max(SCHEMA, Number.isInteger(lib.version) ? lib.version : SCHEMA);
      storage.setItem(key, JSON.stringify(lib));
    },
  };
}

/** Add an empty list, make it current, and return its id. */
export function addList(lib: Library, name?: string): string {
  const id = "l" + Math.random().toString(36).slice(2, 9);
  lib.lists[id] = emptyList(name || `List ${Object.keys(lib.lists).length + 1}`);
  lib.current = id;
  return id;
}

/** A list by id or by name. Names are not unique, so an ambiguous name is an error. */
export function resolveList(lib: Library, ref: string): string {
  if (lib.lists[ref]) return ref;
  const hits = Object.keys(lib.lists).filter((id) => lib.lists[id]!.name === ref);
  if (hits.length === 1) return hits[0]!;
  if (!hits.length) throw new Error(`no list named ${JSON.stringify(ref)} — have: ${Object.values(lib.lists).map((l) => l.name).join(", ")}`);
  throw new Error(`${hits.length} lists are named ${JSON.stringify(ref)} — pass an id instead: ${hits.join(", ")}`);
}

/** Delete a list; if it was current, the first remaining list (or none) becomes current. */
export function deleteList(lib: Library, id: string): void {
  delete lib.lists[id];
  if (lib.current === id) lib.current = Object.keys(lib.lists)[0] ?? null;
}

type Ref = { title: string; url: string; key?: string };
/** The interchange format: readable `{a, b, verdict}` pairs rather than internal keys. */
export interface ExportPayload {
  format: "pairwise-sorter/3";
  name: string;
  items: Item[];
  priority: string[];
  weights: number[];
  combine: Combine;
  benched: Ref[];
  comparisons: { a: Ref; b: Ref; verdict: Verdict }[];
  /** Titles best first — a convenience for humans, ignored on import. */
  ranking: string[];
}

/** A list as a hand-editable export. */
export function exportList(list: List, ranking: string[] = []): ExportPayload {
  const byId = new Map(list.items.map((it) => [idOf(it), it]));
  const ref = (id: string): Ref => {
    const it = byId.get(id);
    return it ? { title: it.title, url: it.url, ...(it.key ? { key: it.key } : {}) } : idParts(id);
  };
  return {
    format: "pairwise-sorter/3",
    name: list.name,
    items: list.items,
    priority: list.priority,
    weights: list.weights,
    combine: list.combine,
    benched: list.benched.map(ref),
    comparisons: list.log.map(([k, verdict]) => {
      const [a = "", b = ""] = k.split(SEP);
      return { a: ref(a), b: ref(b), verdict };
    }),
    ranking,
  };
}

/**
 * Build a list from an export — any of formats /1, /2, /3, or a bare array of items.
 * Answers about items not in the list are skipped and counted.
 */
export function importList(data: unknown): { list: List; count: number; kept: number; skipped: number } {
  if (!data || typeof data !== "object") throw new Error("not a JSON object");
  const d = data as Loose;
  const source = Array.isArray(d) ? d : d.items;
  if (!Array.isArray(source)) throw new Error("no `items` array");

  const items = [...new Map(source.map(fromJSON).filter((x): x is Item => !!x).map((i) => [idOf(i), i])).values()];
  if (items.length < 2) throw new Error("needs at least 2 distinct items");

  const kept = new Set(items.map(idOf));
  let skipped = 0;
  const log: LogEntry[] = [];
  for (const c of Array.isArray(d.comparisons) ? d.comparisons : []) {
    const x = idOf(c?.a), y = idOf(c?.b);
    if (x === y || !kept.has(x) || !kept.has(y)) { skipped++; continue; }
    const v: Verdict = c.verdict > 0 ? 1 : c.verdict < 0 ? -1 : 0;
    // Re-normalise to the key's sorted order; the verdict flips with the operands.
    log.push(x < y ? [x + SEP + y, v] : [y + SEP + x, -v as Verdict]);
  }
  // `benched` since /2, `removed` in /1.
  const benched = [d.benched, d.removed].flatMap((a) => (Array.isArray(a) ? a : [])).map(idOf).filter((id) => kept.has(id));
  const tagged = new Set(items.flatMap((i) => i.tags));
  const priority: string[] = [], weights: number[] = [];
  (Array.isArray(d.priority) ? d.priority : []).forEach((t: unknown, i: number) => {
    const obj = typeof t === "object" && t !== null ? (t as Loose) : null;
    const tag = typeof t === "string" ? tagOf(t) : tagOf(obj?.tag ?? "");
    if (!tagged.has(tag) || priority.includes(tag)) return;
    priority.push(tag);
    const w = Number(obj ? obj.weight : d.weights?.[i]);
    weights.push(w > 0 ? w : 1);
  });

  const list: List = {
    name: d.name || "Imported", items, log, benched, priority, weights,
    combine: d.combine === "weights" ? "weights" : "order",
  };
  return { list, count: items.length, kept: log.length, skipped };
}
