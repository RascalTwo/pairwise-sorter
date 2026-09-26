import { describe, expect, it } from "bun:test";
import {
  addList, deleteList, emptyLibrary, emptyList, exportList, flipOfIds, idOf, importList, item, localStore, migrate,
  pairKeyOf, resolveList, SCHEMA, type Library, type Verdict,
} from "../src/index.ts";

/** A working in-memory Storage — the same contract as window.localStorage. */
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
}

// What the explorables page stored before versioning: no tags, no tiers, `removed` not `benched`.
const legacy = () => ({
  current: "l1",
  lists: {
    l1: { name: "Coffee", items: [{ title: "a", url: "", media: [], desc: "" }, null, { title: "b" }], log: "junk", removed: ["x"], weights: [5] },
    l2: { name: "Tiers", items: "junk", priority: ["good", 3], weights: [0, 2], combine: "weights", benched: ["y", 7] },
  },
});

describe("migrate", () => {
  it("should bring unversioned page data up to the current schema, in order", () => {
    // GIVEN data saved before versioning existed
    const db = legacy() as unknown as Library;

    // WHEN it is migrated
    const steps = migrate(db);

    // THEN every step ran and the version is current
    expect(steps).toBe(SCHEMA);
    expect(db.version).toBe(SCHEMA);
    // THEN items gained tags, junk items dropped, and bad logs became empty
    const coffee = db.lists.l1!;
    expect(coffee.items).toEqual([item("a"), item("b")]);
    expect(coffee.log).toEqual([]);
    // THEN `removed` became `benched`
    expect(coffee.benched).toEqual(["x"]);
    expect("removed" in coffee).toBe(false);
    // THEN tiers and weights stay the same length, with bad weights read as 1
    const tiers = db.lists.l2!;
    expect(tiers.items).toEqual([]);
    expect(tiers.priority).toEqual(["good"]);
    expect(tiers.weights).toEqual([1]);
    expect(tiers.combine).toBe("weights");
    expect(tiers.benched).toEqual(["y"]);
    expect(coffee.combine).toBe("order");
  });

  it("should apply nothing to current data, and leave data from a newer build untouched", () => {
    // GIVEN current data and data from the future
    const now = { ...emptyLibrary(), version: SCHEMA };
    const future = { ...emptyLibrary(), version: SCHEMA + 5 };
    // WHEN each is migrated
    // THEN nothing is applied to either
    expect(migrate(now)).toBe(0);
    expect(migrate(future)).toBe(0);
    expect(future.version).toBe(SCHEMA + 5);
  });

  it("should cope with a database that has no lists", () => {
    // GIVEN a versionless database without lists
    const db = { current: null } as unknown as Library;
    // WHEN migrated
    // THEN it simply becomes current
    expect(migrate(db)).toBe(SCHEMA);
  });
});

describe("localStore", () => {
  it("should load what it saved", () => {
    // GIVEN a store over empty storage
    const store = localStore("k", new MemoryStorage());
    const lib = store.load();
    // WHEN a list is added and saved
    const id = addList(lib, "Mine");
    store.save(lib);
    // THEN a fresh load sees it, stamped with the schema
    const again = store.load();
    expect(again.lists[id]!.name).toBe("Mine");
    expect(again.version).toBe(SCHEMA);
  });

  it("should read the old page's key by default and migrate it", () => {
    // GIVEN the old page's data under its frozen key
    const storage = new MemoryStorage();
    storage.setItem("pairwise-sorter/v4", JSON.stringify(legacy()));
    // WHEN loaded with the default key
    const lib = localStore(undefined, storage).load();
    // THEN it arrives migrated
    expect(lib.lists.l1!.benched).toEqual(["x"]);
    expect(lib.current).toBe("l1");
  });

  it("should start fresh on corrupt or missing data", () => {
    // GIVEN storage holding garbage, and storage holding a non-library
    const bad = new MemoryStorage(); bad.setItem("k", "{not json");
    const odd = new MemoryStorage(); odd.setItem("k", '{"lists":5}');
    // WHEN each is loaded
    // THEN both are empty libraries
    expect(localStore("k", bad).load()).toEqual(emptyLibrary());
    expect(localStore("k", odd).load()).toEqual(emptyLibrary());
  });

  it("should never lower a version written by a newer build", () => {
    // GIVEN a library a newer build stamped
    const storage = new MemoryStorage();
    const store = localStore("k", storage);
    // WHEN this build saves it
    store.save({ ...emptyLibrary(), version: SCHEMA + 1 });
    // THEN the newer version is kept
    expect(JSON.parse(storage.getItem("k")!).version).toBe(SCHEMA + 1);
  });

  it("should use the page's localStorage when none is given", () => {
    // GIVEN a global localStorage
    const g = globalThis as { localStorage?: unknown };
    const had = g.localStorage;
    g.localStorage = new MemoryStorage();
    try {
      // WHEN a store is made without one
      const store = localStore("k");
      store.save(emptyLibrary());
      // THEN it reads and writes the global one
      expect(store.load().version).toBe(SCHEMA);
    } finally {
      g.localStorage = had;
    }
  });
});

describe("list management", () => {
  it("should add, resolve by id or unique name, and delete lists", () => {
    // GIVEN a library with two lists, two of them sharing a name
    const lib = emptyLibrary();
    const a = addList(lib);
    const b = addList(lib, "Dup");
    const c = addList(lib, "Dup");

    // WHEN lists are resolved
    // THEN an unnamed list gets a numbered name and becomes current
    expect(lib.lists[a]!.name).toBe("List 1");
    expect(lib.current).toBe(c);
    // THEN ids and unique names resolve
    expect(resolveList(lib, a)).toBe(a);
    expect(resolveList(lib, "List 1")).toBe(a);
    // THEN an ambiguous or unknown name is an error, never a silent first match
    expect(() => resolveList(lib, "Dup")).toThrow(`2 lists are named "Dup" — pass an id instead: ${b}, ${c}`);
    expect(() => resolveList(lib, "Nope")).toThrow('no list named "Nope" — have: List 1, Dup, Dup');

    // WHEN the current list is deleted
    deleteList(lib, c);
    // THEN another list becomes current
    expect(lib.current).toBe(a);
    // WHEN a list that is not current is deleted
    deleteList(lib, b);
    // THEN the current list stays
    expect(lib.current).toBe(a);
    // WHEN the last list is deleted
    deleteList(lib, a);
    // THEN nothing is current
    expect(lib.current).toBeNull();
  });
});

describe("export and import", () => {
  const items = [item("a", "u", ["m.png"], "d", ["x"]), item("b"), item("c", "", [], "", ["y"])];
  const [a, b, c] = items.map(idOf) as [string, string, string];
  const said = (x: string, y: string, v: Verdict): [string, Verdict] => [pairKeyOf(x, y), (v * flipOfIds(x, y)) as Verdict];

  it("should round-trip a list through its readable export", () => {
    // GIVEN a list with answers, a benched item and weighted tiers
    const list = {
      ...emptyList("Mine"), items, log: [said(a, b, -1), said(b, c, 0)], benched: [c],
      priority: ["x", "y"], weights: [2, 1], combine: "weights" as const,
    };
    // WHEN exported and imported
    const payload = exportList(list, ["a", "b"]);
    const back = importList(JSON.parse(JSON.stringify(payload)));
    // THEN comparisons are readable pairs, not internal keys
    expect(payload.format).toBe("pairwise-sorter/3");
    expect(payload.comparisons[0]).toEqual({ a: { title: "a", url: "u" }, b: { title: "b", url: "" }, verdict: said(a, b, -1)[1] });
    expect(payload.ranking).toEqual(["a", "b"]);
    // THEN the imported list matches the original
    expect(back.list).toEqual(list);
    expect(back).toMatchObject({ count: 3, kept: 2, skipped: 0 });
  });

  it("should keep keyed items' answers across export and import, and export unknown ids by their parts", () => {
    // GIVEN keyed items with one answer, and a bench entry for an item no longer in the list
    const k = [item("Old", "viz://1", [], "", [], "viz://1"), item("Two", "viz://2", [], "", [], "viz://2")];
    const list = { ...emptyList("Keyed"), items: k, log: [said(idOf(k[0]), idOf(k[1]), -1)], benched: [idOf(item("gone", "g"))] };
    // WHEN exported and imported
    const payload = exportList(list);
    const back = importList(JSON.parse(JSON.stringify(payload)));
    // THEN the comparison names items by key
    expect(payload.comparisons[0]!.a.key).toBe("viz://1");
    // THEN the answer survives the round trip
    expect(back.kept).toBe(1);
    expect(back.list.log).toEqual(list.log);
    // THEN the unknown bench entry exports as its title and url
    expect(payload.benched).toEqual([{ title: "gone", url: "g" }]);
  });

  it("should read old formats, skip answers about unknown items, and dedupe items", () => {
    // GIVEN a /1 export: a bare items array with `removed`, a duplicate and junk comparisons
    const data = {
      name: "", items: ["a", { name: "b" }, "a"], removed: [{ title: "b" }],
      comparisons: [
        { a: { title: "a" }, b: { title: "b" }, verdict: 5 },
        { a: { title: "a" }, b: { title: "zzz" }, verdict: 1 },
        { a: { title: "a" }, b: { title: "a" }, verdict: 1 },
        null,
      ],
      priority: [{ tag: "#nope" }], combine: "bogus",
    };
    // WHEN imported
    const r = importList(data);
    // THEN duplicates collapse, and it gets a default name
    expect(r.list.items.map((i) => i.title)).toEqual(["a", "b"]);
    expect(r.list.name).toBe("Imported");
    // THEN verdicts are clamped, and bad comparisons are skipped
    expect(r.list.log).toEqual([said(idOf(item("a")), idOf(item("b")), 1)]);
    expect(r.skipped).toBe(3);
    // THEN `removed` is read as the bench, and tiers on tags no item carries are dropped
    expect(r.list.benched).toEqual([idOf(item("b"))]);
    expect(r.list.priority).toEqual([]);
    expect(r.list.combine).toBe("order");
  });

  it("should read tier weights given as objects or as a parallel array, and drop repeats", () => {
    // GIVEN tagged items and tiers in both shapes
    const data = {
      items: [item("a", "", [], "", ["x"]), item("b", "", [], "", ["y"])],
      priority: [{ tag: "x", weight: 3 }, "y", "x", 9],
      weights: [0, 4],
    };
    // WHEN imported
    const r = importList(data);
    // THEN each tier keeps its weight once
    expect(r.list.priority).toEqual(["x", "y"]);
    expect(r.list.weights).toEqual([3, 4]);
    // THEN a bare array of items also imports
    expect(importList(["p", "q"]).count).toBe(2);
  });

  it("should flip a verdict whose pair is written in the opposite order to the internal key", () => {
    // GIVEN an export that says "b beats a", naming b first
    const data = { items: ["a", "b"], comparisons: [{ a: { title: "b" }, b: { title: "a" }, verdict: -1 }] };
    // WHEN imported
    const { list } = importList(data);
    // THEN the log says b beats a
    expect(list.log).toEqual([said(idOf(item("b")), idOf(item("a")), -1)]);
  });

  it("should refuse input that is not a list worth sorting", () => {
    // GIVEN non-objects, missing items and too few items
    // WHEN imported
    // THEN each is a clear error
    expect(() => importList(null)).toThrow("not a JSON object");
    expect(() => importList({})).toThrow("no `items` array");
    expect(() => importList({ items: ["a", "a"] })).toThrow("needs at least 2 distinct items");
  });
});
