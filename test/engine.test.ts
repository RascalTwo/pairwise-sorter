import { describe, expect, it } from "bun:test";
import { budgetFor, createEngine, findConflicts, replay, retireLog, flipOfIds, idOf, item, migrateId, orient, pairKeyOf, SEP, tieClasses, tierName, tierOf, tierVerdict, type LogEntry, type Verdict } from "../src/index.ts";

const alphabetical = ["e", "c", "a", "d", "b"].map((t) => item(t, "u" + t));
// An `ask` that records how often it was called.
let asked = 0;
const counting = (v: Verdict) => async (): Promise<Verdict> => { asked++; return v; };
const byTitle = (items: { title: string }[]) => async (a: number, b: number): Promise<Verdict> =>
  items[a]!.title < items[b]!.title ? -1 : 1;

describe("createEngine", () => {
  it("should recover a known total order exactly, then replay it without asking anything", async () => {
    // GIVEN five items whose true order is alphabetical
    const eng = createEngine({ items: alphabetical });

    // WHEN a full run is answered alphabetically
    const order = await eng.run(byTitle(alphabetical));

    // THEN the ranking is alphabetical
    expect(eng.ranking(order).map((i) => i.title).join("")).toBe("abcde");

    // THEN a second engine seeded with that log asks nothing
    asked = 0;
    const replay = createEngine({ items: alphabetical, log: eng.state.log });
    await replay.run(counting(-1));
    expect(asked).toBe(0);
  });

  it("should keep tied items in their original order", async () => {
    // GIVEN three items
    const items = ["x", "y", "z"].map((t) => item(t));
    // WHEN every pair is answered "equal"
    const eng = createEngine({ items });
    const order = await eng.run(async () => 0 as const);
    // THEN the order is unchanged
    expect(eng.ranking(order).map((i) => i.title)).toEqual(["x", "y", "z"]);
  });

  it("should answer cross-tier pairs from the tiers without asking, and never log them", async () => {
    // GIVEN one item tagged good and one tagged bad, with good ranked above bad
    const items = [item("hi", "1", [], "", ["good"]), item("lo", "2", [], "", ["bad"])];
    const eng = createEngine({ items, priority: ["good", "bad"] });

    // WHEN the sort runs
    asked = 0;
    const order = await eng.run(counting(1));

    // THEN nobody was asked
    expect(asked).toBe(0);
    // THEN the good item ranks first
    expect(eng.ranking(order)[0]!.title).toBe("hi");
    // THEN the log stays empty
    expect(eng.state.log).toHaveLength(0);
  });

  it("should let a logged answer override the tier order", async () => {
    // GIVEN tiers that put hi above lo
    const items = [item("hi", "1", [], "", ["good"]), item("lo", "2", [], "", ["bad"])];
    const ia = idOf(items[0]!), ib = idOf(items[1]!);
    // GIVEN a logged answer that lo beats hi
    const log: [string, Verdict][] = [[pairKeyOf(ia, ib), ia < ib ? 1 : -1]];

    // WHEN the sort runs
    const eng = createEngine({ items, priority: ["good", "bad"], log });
    const order = await eng.run(async () => { throw new Error("should not ask"); });

    // THEN lo ranks first
    expect(eng.ranking(order)[0]!.title).toBe("lo");
  });

  it("should keep an answer across a retitle when items carry an explicit key", async () => {
    // GIVEN two keyed items with one answer between them
    const k1 = item("Old Title", "viz://v-abc", [], "", [], "viz://v-abc");
    const k2 = item("Other", "viz://v-def", [], "", [], "viz://v-def");
    const first = createEngine({ items: [k1, k2] });
    await first.run(async () => -1 as const);

    // WHEN the first item is retitled and the sort replays
    const renamed = item("A Completely New Title", "viz://v-abc", [], "", [], "viz://v-abc");
    const second = createEngine({ items: [renamed, k2], log: first.state.log });
    asked = 0;
    await second.run(counting(1));

    // THEN nothing is asked again
    expect(asked).toBe(0);
  });

  it("should orphan an answer on retitle when items have no key", async () => {
    // GIVEN two unkeyed items with one answer between them
    const n2 = item("Other", "u2");
    const first = createEngine({ items: [item("Old", "u1"), n2] });
    await first.run(async () => -1 as const);

    // WHEN the first item is retitled and the sort replays
    const second = createEngine({ items: [item("New", "u1"), n2], log: first.state.log });
    asked = 0;
    await second.run(counting(1));

    // THEN the pair is asked again, because title+url is the identity
    expect(asked).toBe(1);
  });
});

describe("migrateId", () => {
  it("should keep a verdict's meaning when a rename swaps which id sorts first", () => {
    // GIVEN "a beats b" logged against the sorted pair key
    const A = idOf(item("a", "")), B = idOf(item("b", "")), Z = idOf(item("z", ""));
    const log: [string, Verdict][] = [[pairKeyOf(A, B), A < B ? -1 : 1]];

    // WHEN a is renamed to z, which now sorts after b
    migrateId(log, new Set(), A, Z);

    // THEN the log still says z beats b
    const [k, v] = log[0]!;
    const [first] = k.split(SEP);
    expect(first === Z ? v : -v).toBe(-1);
  });
});

describe("budgetFor", () => {
  it("should be the binary-insertion worst case", () => {
    // GIVEN five items
    // WHEN the worst case is computed
    // THEN it is 0+1+2+2+3 = 8 comparisons
    expect(budgetFor(5)).toBe(8);
  });
});

describe("tieClasses", () => {
  it("should share a class across a chain of equal answers, even for a pair never compared", () => {
    // GIVEN a = b and b = c, and d never tied with anything
    const [a, b, c, d] = ["a", "b", "c", "d"].map((t) => item(t));
    const log: [string, Verdict][] = [
      [pairKeyOf(idOf(a), idOf(b)), 0],
      [pairKeyOf(idOf(b), idOf(c)), 0],
      [pairKeyOf(idOf(c), idOf(d)), -1],
      [pairKeyOf(idOf(a), "gone"), 0],
    ];

    // WHEN tie classes are built
    const find = tieClasses([a!, b!, c!, d!], log);

    // THEN a and c share a class
    expect(find(idOf(a))).toBe(find(idOf(c)));
    // THEN d stands alone
    expect(find(idOf(d))).not.toBe(find(idOf(a)));
    // THEN an unknown id is its own class
    expect(find("gone")).toBe("gone");
  });
});

describe("findConflicts", () => {
  const [a, b, c] = ["a", "b", "c"].map((t) => idOf(item(t)));
  const says = (x: string, y: string, v: Verdict): [string, Verdict] =>
    [pairKeyOf(x, y), (v * flipOfIds(x, y)) as Verdict];

  it("should flag an answer that the final order contradicts", () => {
    // GIVEN a > b, b > c, c > a — a cycle
    const log = [says(a!, b!, -1), says(b!, c!, -1), says(c!, a!, -1)];

    // WHEN the order a, b, c is checked
    const bad = findConflicts(log, new Map([[a!, 1], [b!, 2], [c!, 3]]));

    // THEN only the cycle-closing answer is flagged
    expect([...bad.keys()]).toEqual([2]);
    expect(bad.get(2)).toBe("this answer disagrees with the final ranking");
  });

  it("should flag an equal answer whose items ranked apart, and ignore items no longer ranked", () => {
    // GIVEN a = b, and an answer about an item that is not ranked
    const log = [says(a!, b!, 0), says(a!, "gone", -1), says(a!, c!, 0)];

    // WHEN a and b rank apart and a ties c
    const bad = findConflicts(log, new Map([[a!, 1], [b!, 2], [c!, 1]]));

    // THEN only the a = b answer is flagged
    expect([...bad.entries()]).toEqual([[0, "you called these equal, but they ranked apart"]]);
  });
});

describe("tiers", () => {
  it("should name a tier by its tag, and the bottom band as untiered", () => {
    // GIVEN tiers good > bad
    const priority = ["good", "bad"];
    // WHEN tiers are looked up and named
    // THEN an item takes its best tier
    expect(tierOf(item("x", "", [], "", ["bad", "good"]), priority)).toBe(0);
    // THEN names read back as tags
    expect(tierName(1, priority)).toBe("#bad");
    expect(tierName(tierOf(item("y"), priority), priority)).toBe("untiered");
  });

  it("should ask about pairs when tiers are off or both items share a tier", () => {
    // GIVEN two items in the same tier
    const x = item("x", "", [], "", ["good"]), y = item("y", "", [], "", ["good"]);
    // WHEN a tier verdict is asked for
    // THEN there is none, with or without tiers
    expect(tierVerdict(x, y, ["good"])).toBeNull();
    expect(tierVerdict(x, y, [])).toBeNull();
  });
});

describe("engine bookkeeping", () => {
  it("should carry answers across a migrate, report its budget, and serialise to plain data", async () => {
    // GIVEN a sorted three-item list with one benched item
    const items = ["a", "b", "c", "d"].map((t) => item(t));
    const eng = createEngine({ items, benched: [idOf(items[3])] });
    const records: number[] = [];
    await eng.run(byTitle(items), { onRecord: (log) => records.push(log.length) });

    // WHEN "a" is renamed to "z" through the engine
    eng.migrate(idOf(items[0]), idOf(item("z")));
    eng.state.items[0] = item("z");

    // THEN the next run re-asks nothing, and z still ranks first
    asked = 0;
    const order = await eng.run(counting(1));
    expect(asked).toBe(0);
    expect(eng.ranking(order).map((i) => i.title)).toEqual(["z", "b", "c"]);
    // THEN every recorded answer was reported as it happened
    expect(records).toEqual([1, 2, 3].slice(0, eng.answeredCount()));
    // THEN the budget counts only live items
    expect(eng.live()).toEqual([0, 1, 2]);
    expect(eng.budget()).toBe(budgetFor(3));
    // THEN ties and conflicts are available off the engine
    expect(eng.ties()(idOf(items[1]))).toBe(idOf(items[1]));
    expect(eng.conflicts(new Map()).size).toBe(0);
    // THEN toJSON is plain, JSON-safe data
    expect(JSON.parse(JSON.stringify(eng.toJSON())).benched).toEqual([idOf(items[3])]);
  });

  it("should keep an equal answer a plain 0 through a migrate and an engine run", async () => {
    // GIVEN a tie logged between a and b, then a renamed to z
    const log: [string, Verdict][] = [[pairKeyOf("a", "b"), 0]];
    migrateId(log, undefined, "a", "z");
    // WHEN a fresh engine is asked about a pair in flipped order and told they are equal
    const items = [item("b"), item("a")];
    const eng = createEngine({ items });
    await eng.run(async () => 0 as const);
    // THEN neither log holds -0
    expect(Object.is(log[0]![1], 0)).toBe(true);
    expect(Object.is(eng.state.log[0]![1], 0)).toBe(true);
  });

  it("should leave the log alone when an id is migrated onto itself", () => {
    // GIVEN a log with one answer
    const log: [string, Verdict][] = [[pairKeyOf("a", "b"), 1]];
    // WHEN an id is migrated to itself
    const out = migrateId(log, undefined, "a", "a");
    // THEN nothing changes
    expect(out).toEqual([[pairKeyOf("a", "b"), 1]]);
  });
});

describe("replay (synchronous)", () => {
  const ids = (xs: { title: string }[]) => xs.map((x) => x.title);

  it("should give the order the answers already settle, and the first pair they do not", async () => {
    // GIVEN c, b, d, a sorted alphabetically by an engine
    const items = ["c", "b", "d", "a"].map((t) => item(t));
    const eng = createEngine({ items });
    await eng.run(byTitle(items));
    // WHEN the full log is replayed
    const full = replay(items, eng.state.log);
    // THEN every item is placed in the same order, with nothing left to ask
    expect(ids(full.order.map((i) => items[i]!))).toEqual(["a", "b", "c", "d"]);
    expect([full.unplaced, full.next]).toEqual([[], null]);
    // WHEN only the first two answers are replayed
    const part = replay(items, eng.state.log.slice(0, 2));
    // THEN it stops at the first unanswered pair, naming it
    expect(part.unplaced.length).toBeGreaterThan(0);
    expect(part.next).not.toBeNull();
    expect(part.order.length + part.unplaced.length).toBe(4);
  });

  it("should settle cross-tier pairs from tiers without any answer", () => {
    // GIVEN one top and one low item and no answers
    const items = [item("lo", "", [], "", ["low"]), item("hi", "", [], "", ["top"])];
    // WHEN replayed with tiers
    // THEN the tier order is the order
    expect(ids(replay(items, [], ["top", "low"]).order.map((i) => items[i]!))).toEqual(["hi", "lo"]);
  });
});

describe("retireLog (synchronous)", () => {
  it("should drop retired items' answers and fill in, as implied, every pair the old order settles", async () => {
    // GIVEN c, b, d, a, e sorted — c was everyone's stepping stone
    const items = ["c", "b", "d", "a", "e"].map((t) => item(t));
    const eng = createEngine({ items });
    await eng.run(byTitle(items));
    const c = idOf(items[0]);
    // WHEN c is retired from the log
    const rest = items.slice(1);
    const log = retireLog(items, eng.state.log, [c]);
    // THEN no answer mentions c, some answers are implied, and the rest replay in the old order with nothing to ask
    expect(log.some(([k]) => k.includes(c))).toBe(false);
    expect(log.some((e) => e[2] === true)).toBe(true);
    const r = replay(rest, log);
    expect(r.order.map((i) => rest[i]!.title)).toEqual(["a", "b", "d", "e"]);
    expect(r.next).toBeNull();
  });

  it("should leave answers alone when nothing needs filling, and keep ties tied", () => {
    // GIVEN a = b = c through b, and an unrelated retire of nothing
    const items = ["a", "b", "c"].map((t) => item(t));
    const [a, b, c] = items.map(idOf) as [string, string, string];
    const log: [string, Verdict][] = [[pairKeyOf(a, b), 0], [pairKeyOf(b, c), 0]];
    // WHEN nothing is retired
    // THEN the log is unchanged
    expect(retireLog(items, log, [])).toEqual(log);
    // WHEN b is retired
    // THEN a and c are tied by an implied answer
    expect(retireLog(items, log, [b])).toEqual([[pairKeyOf(a, c), 0, true]]);
  });
});

describe("known answers narrow the search", () => {
  // Seven items ranked a..g, then "x" arrives already known to come after "e" (a dependency,
  // say). The only slots left are after e, so a question about a, b, c or d is one with a
  // single possible answer — and answering it the other way would contradict what is known.
  const ranked = ["a", "b", "c", "d", "e", "f", "g"].map((t) => item(t));
  const x = item("x");
  const items = [...ranked, x];
  const id = (t: string) => idOf(item(t));
  // "a comes after b": b wins, recorded the way the engine records it.
  const after = (a: string, b: string): LogEntry => [pairKeyOf(id(b), id(a)), orient(-1, flipOfIds(id(b), id(a))), true];
  const chain = async () => { const eng = createEngine({ items: ranked }); await eng.run(byTitle(ranked)); return eng.state.log; };

  it("should ask replay's next question only inside the slots the known answers leave", async () => {
    // GIVEN a..g ranked and x known to come after e
    const log = [...(await chain()), after("x", "e")];
    // WHEN replayed
    const { next } = replay(items, log);
    // THEN the next question pits x against f or g, never against something above e
    expect(["f", "g"]).toContain(items[next![1]]!.title);
  });

  it("should place an item with no question when the known answers pin it to one slot", async () => {
    // GIVEN x known to come after e and before f
    const log = [...(await chain()), after("x", "e"), after("f", "x")];
    // WHEN replayed
    const r = replay(items, log);
    // THEN x lands between e and f with nothing left to ask
    expect(r.next).toBeNull();
    expect(r.order.map((i) => items[i]!.title).join("")).toBe("abcdexfg");
  });

  it("should never ask the person a pair outside the narrowed slots during a run", async () => {
    // GIVEN an engine seeded with a..g and "x after e"
    const eng = createEngine({ items, log: [...(await chain()), after("x", "e")] });
    const seen: string[] = [];
    // WHEN a run asks about x, answering "x first" every time
    await eng.run(async (a, b) => { seen.push(items[b]!.title); return -1 as const; });
    // THEN it only ever asked against f or g, and x still landed after e
    expect(seen.every((t) => t === "f" || t === "g")).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("should fall back to the whole list when the known answers contradict each other", async () => {
    // GIVEN x known to come after e AND before b — impossible
    const log = [...(await chain()), after("x", "e"), after("b", "x")];
    // WHEN replayed
    // THEN it still produces a next question instead of throwing or looping
    expect(replay(items, log).next).not.toBeNull();
  });
});
