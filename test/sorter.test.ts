import { describe, expect, it } from "bun:test";
import { emptyList, flipOfIds, idOf, item, pairKeyOf, Sorter, type LogEntry, type Verdict } from "../src/index.ts";

const said = (a: string, b: string, v: Verdict): LogEntry => [pairKeyOf(a, b), (v * flipOfIds(a, b)) as Verdict];

/** A person who prefers titles alphabetically: "a" beats "b". */
const alphabetically = (s: Sorter): Verdict => {
  const { a, b } = s.question!;
  return s.list.items[a]!.title < s.list.items[b]!.title ? -1 : 1;
};
/** Answer every question the sorter asks, the way `choose` says to. */
async function answerAll(s: Sorter, choose: (s: Sorter) => Verdict = alphabetically) {
  await s.settled();
  let n = 0;
  while (s.question) { await s.answer(choose(s)); n++; }
  return n;
}
const titles = (s: Sorter) => s.ranking().map((r) => r.item.title);
const sorterOf = (...names: string[]) => new Sorter({ ...emptyList("t"), items: names.map((n) => item(n)) });

describe("Sorter: ranking a list", () => {
  it("should ask about pairs until the list is sorted, then report a complete ranking", async () => {
    // GIVEN four unsorted items
    const s = sorterOf("d", "b", "a", "c");

    // WHEN every question is answered alphabetically
    const asked = await answerAll(s);

    // THEN the ranking is alphabetical and complete
    expect(titles(s)).toEqual(["a", "b", "c", "d"]);
    expect(s.complete).toBe(true);
    // THEN it asked no more than the worst case
    expect(asked).toBeLessThanOrEqual(s.budget());
    expect(s.list.log).toHaveLength(asked);
  });

  it("should finish at once with fewer than two items to compare", async () => {
    // GIVEN a one-item list
    const s = sorterOf("only");
    // WHEN it settles
    await s.settled();
    // THEN nothing is asked and the ranking is that item
    expect(s.question).toBeNull();
    expect(titles(s)).toEqual(["only"]);
  });

  it("should show the partial order mid-sort, and how much of it is final", async () => {
    // GIVEN a sort that has started
    const s = sorterOf("c", "a", "b", "d");
    await s.settled();
    // WHEN one question is answered
    await s.answer(alphabetically(s));
    // THEN the ranking is the placed items only
    expect(s.complete).toBe(false);
    expect(s.placement().total).toBe(4);
    expect(titles(s)).toHaveLength(s.placement().placed);
  });

  it("should fire events a host can save on and render from", async () => {
    // GIVEN a sorter with listeners
    const s = sorterOf("b", "a");
    const seen: string[] = [];
    for (const t of ["change", "question", "done"]) s.addEventListener(t, () => seen.push(t));
    // WHEN the only question is answered
    await answerAll(s);
    // THEN it announced the question, the saved answer and the finished ranking
    expect(seen).toEqual(["question", "change", "done"]);
  });

  it("should tell a host which pairs could be asked next, so their media can be preloaded", async () => {
    // GIVEN a sorter with a preload listener
    const s = sorterOf("a", "b", "c", "d", "e");
    const upcoming: number[][] = [];
    s.addEventListener("upcoming", (e) => upcoming.push((e as CustomEvent<number[]>).detail));
    // WHEN the sort runs to the end
    await answerAll(s);
    // THEN every hint named real items
    expect(upcoming.length).toBeGreaterThan(0);
    expect(upcoming.flat().every((i) => i >= 0 && i < 5)).toBe(true);
  });

  it("should store an equal answer as 0 whichever way round the pair was shown", async () => {
    // GIVEN two items asked in an order opposite to their key order
    const s = sorterOf("a", "b");
    await s.settled();
    // WHEN they are called equal
    await s.answer(0);
    // THEN the log holds a plain 0, never -0
    expect(Object.is(s.list.log[0]![1], 0)).toBe(true);
  });

  it("should refuse an answer when nothing is being asked", async () => {
    // GIVEN a finished sort
    const s = sorterOf("a", "b");
    await answerAll(s);
    // WHEN it is answered again
    // THEN it says so
    expect(() => s.answer(-1)).toThrow("nothing is being asked right now");
  });
});

describe("Sorter: changing your mind", () => {
  it("should undo the last answer and ask it again", async () => {
    // GIVEN a sort with answers given
    const s = sorterOf("a", "b", "c");
    await s.settled();
    await s.answer(alphabetically(s));
    const pair = { ...s.question! };
    await s.answer(alphabetically(s));

    // WHEN the last answer is undone
    await s.undo();

    // THEN that same pair is asked again
    expect(s.question).toEqual(pair);
    expect(s.list.log).toHaveLength(1);
  });

  it("should forget one chosen answer, or all of them", async () => {
    // GIVEN a finished sort
    const s = sorterOf("c", "a", "b");
    const n = await answerAll(s);
    // WHEN the first answer is deleted
    await s.deleteAnswer(0);
    // THEN it is gone and has to be asked again
    expect(s.list.log).toHaveLength(n - 1);
    expect(s.question).not.toBeNull();
    // WHEN every answer is reset
    await s.resetAnswers();
    // THEN the log is empty
    expect(s.list.log).toEqual([]);
    // THEN deleting a missing index is an error
    expect(() => s.deleteAnswer(99)).toThrow("no comparison at index 99");
  });

  it("should ignore undo with nothing to undo", async () => {
    // GIVEN a fresh sort
    const s = sorterOf("a", "b");
    await s.settled();
    // WHEN undo is pressed
    await s.undo();
    // THEN the same question is still open
    expect(s.question).not.toBeNull();
  });

  it("should list answers readably, flag contradictions, and not pretend to fix a genuine cycle", async () => {
    // GIVEN a saved cycle: a > b, b > c, c > a
    const items = ["a", "b", "c"].map((t) => item(t));
    const [a, b, c] = items.map(idOf) as [string, string, string];
    const s = new Sorter({ ...emptyList("t"), items, log: [said(a, b, -1), said(b, c, -1), said(c, a, -1)] });
    await s.settled();

    // WHEN the answers are read
    const answers = s.comparisons();
    // THEN they are readable pairs, and the cycle-closing answer is flagged
    expect(answers.map((x) => [x.a.title, x.b.title])).toEqual([["a", "b"], ["b", "c"], ["a", "c"]]);
    expect(answers.filter((x) => x.why).map((x) => x.index)).toEqual([2]);
    // THEN resolving reports no gain, since no order satisfies a cycle
    expect(s.resolve()).toEqual({ before: 1, after: 1 });
  });

  it("should reorder to contradict fewer answers when an order can", async () => {
    // GIVEN a > b and b > c, plus "c beats a" said twice
    const items = ["a", "b", "c"].map((t) => item(t));
    const [a, b, c] = items.map(idOf) as [string, string, string];
    const s = new Sorter({ ...emptyList("t"), items, log: [said(a, b, -1), said(b, c, -1), said(c, a, -1), said(c, a, -1)] });
    await s.settled();
    const done: string[] = [];
    s.addEventListener("done", () => done.push("done"));
    // WHEN it is resolved
    const r = s.resolve();
    // THEN it contradicts one answer instead of two, honouring the doubled "c beats a"
    expect(r).toEqual({ before: 2, after: 1 });
    expect(titles(s).indexOf("c")).toBeLessThan(titles(s).indexOf("a"));
    // THEN the new ranking was announced
    expect(done).toEqual(["done"]);
  });
});

describe("Sorter: benching", () => {
  it("should take a benched item out of the ranking, and put it back without re-asking", async () => {
    // GIVEN a finished sort
    const s = sorterOf("a", "b", "c");
    await answerAll(s);
    const b = idOf(s.list.items[1]);

    // WHEN b is benched, and the question it was standing between is answered
    await s.bench([b]);
    await answerAll(s);
    // THEN it leaves the ranking
    expect(titles(s)).toEqual(["a", "c"]);
    expect(s.benchedItems().map((i) => i.title)).toEqual(["b"]);

    // WHEN it is subbed back in
    await s.subIn(b);
    // THEN it returns to its place with nothing asked
    expect(s.question).toBeNull();
    expect(titles(s)).toEqual(["a", "b", "c"]);
  });

  it("should sub every benched item back in at once", async () => {
    // GIVEN two benched items
    const s = sorterOf("a", "b", "c");
    await answerAll(s);
    await s.bench([idOf(s.list.items[0]), idOf(s.list.items[1])]);
    // WHEN all are subbed in
    await s.subAll();
    // THEN the bench is empty
    expect(s.list.benched).toEqual([]);
    expect(() => s.subIn("nope")).toThrow("that item is not benched");
  });
});

describe("Sorter: editing items", () => {
  it("should add new items and ask only about them", async () => {
    // GIVEN a finished sort of three
    const s = sorterOf("b", "d", "f");
    await answerAll(s);
    // WHEN one item is added
    const r = s.setItems([...s.list.items, item("c")]);
    const asked = await answerAll(s);
    // THEN only the newcomer was placed, with about log2 n questions
    expect(r).toEqual({ dupes: [], dropped: 0 });
    expect(asked).toBeLessThanOrEqual(2);
    expect(titles(s)).toEqual(["b", "c", "d", "f"]);
  });

  it("should merge duplicates, keep the existing order, and drop only deleted items' answers", async () => {
    // GIVEN a finished sort with a benched item and a tier on a tag
    const s = new Sorter({ ...emptyList("t"), items: [item("a", "", [], "", ["x"]), item("b"), item("c")] });
    await answerAll(s);
    await s.bench([idOf(s.list.items[0])]);
    await s.setPriority(["x"]);

    // WHEN the items are replaced with c, b, a duplicate b, and without a
    const r = s.setItems([item("c"), item("b"), item("b")]);

    // THEN the duplicate is reported and a's answers are dropped
    expect(r.dupes).toEqual(["b"]);
    expect(r.dropped).toBeGreaterThan(0);
    // THEN the survivors keep their original order, and the bench and tiers are pruned
    expect(s.list.items.map((i) => i.title)).toEqual(["b", "c"]);
    expect(s.list.benched).toEqual([]);
    expect(s.list.priority).toEqual([]);
    // THEN too few items is refused
    expect(() => s.setItems([item("z")])).toThrow("need at least 2 distinct items");
  });

  it("should carry a renamed item's answers across instead of asking again", async () => {
    // GIVEN a finished sort
    const s = sorterOf("a", "b", "c");
    await answerAll(s);
    // WHEN "a" is renamed
    await s.editItem(0, { title: "aa", desc: "new" });
    // THEN nothing is asked and it keeps first place
    expect(s.question).toBeNull();
    expect(titles(s)).toEqual(["aa", "b", "c"]);
    // THEN renaming onto another item is refused rather than merged, and a title is required
    expect(() => s.editItem(0, { title: "b" })).toThrow("another item already has that title and link");
    expect(() => s.editItem(0, { title: " " })).toThrow("a title is required");
    expect(() => s.editItem(9, {})).toThrow("no item at index 9");
  });
});

describe("Sorter: tiers", () => {
  const tagged = () => new Sorter({
    ...emptyList("t"),
    items: [item("low1", "", [], "", ["low"]), item("top1", "", [], "", ["top"]), item("low2", "", [], "", ["low"]), item("top2", "", [], "", ["top"])],
  });

  it("should never ask across tiers, and put the higher tier first", async () => {
    // GIVEN top and low tiers
    const s = tagged();
    await s.setPriority(["top", "low"]);
    // WHEN the sort is answered
    const asked = await answerAll(s);
    // THEN only within-tier pairs were asked
    expect(asked).toBe(2);
    expect(s.budget()).toBe(2);
    // THEN every top item outranks every low item
    expect(titles(s)).toEqual(["top1", "top2", "low1", "low2"]);
    expect(s.tags()).toEqual(["low", "top"]);
  });

  it("should combine tiers by weight when asked, and accept weights with tags", async () => {
    // GIVEN tiers where low weighs far more
    const s = tagged();
    await answerAll(s);
    await s.setPriority([{ tag: "top", weight: 1 }, { tag: "low", weight: 50 }]);
    // WHEN combined by weight
    await s.setCombine("weights");
    // THEN a low item leads
    expect(titles(s)[0]).toStartWith("low");
    expect(s.list.weights).toEqual([1, 50]);
    // THEN bad input is refused
    expect(() => s.setCombine("sum" as never)).toThrow("combine expects 'order' or 'weights'");
    expect(() => s.setPriority(["nope"])).toThrow("no item carries #nope — have: low, top");
  });

  it("should find and drop your answers that go against the tiers", async () => {
    // GIVEN answers where a low item beat a top item
    const s = tagged();
    await answerAll(s, (x) => (x.list.items[x.question!.a]!.title.startsWith("low") ? -1 : 1));
    await s.setPriority(["top", "low"]);
    // WHEN overrides are listed
    const over = s.overrides();
    // THEN they are found
    expect(over.length).toBeGreaterThan(0);
    // WHEN they are dropped
    await s.dropOverrides();
    // THEN none remain and the tiers decide
    expect(s.overrides()).toEqual([]);
    expect(titles(s).slice(0, 2).every((t) => t.startsWith("top"))).toBe(true);
  });

  it("should keep a tier and its weight while a tag survives edits, and drop it with its last tag", async () => {
    // GIVEN weighted tiers
    const s = tagged();
    await s.setPriority([{ tag: "top", weight: 3 }, { tag: "low", weight: 2 }]);
    // WHEN one top item loses its tag
    await s.editItem(1, { tags: [] });
    // THEN both tiers survive with their weights
    expect(s.list.priority).toEqual(["top", "low"]);
    expect(s.list.weights).toEqual([3, 2]);
    // WHEN the last top item loses its tag
    await s.editItem(3, { tags: [] });
    // THEN the top tier is gone and low keeps its weight
    expect(s.list.priority).toEqual(["low"]);
    expect(s.list.weights).toEqual([2]);
  });

  it("should turn tiers off with an empty priority, and ignore blank entries", async () => {
    // GIVEN tiers on
    const s = tagged();
    await s.setPriority(["top", "", { tag: "#top" }]);
    expect(s.list.priority).toEqual(["top"]);
    // WHEN priority is emptied
    await s.setPriority([]);
    // THEN tiers are off
    expect(s.list.priority).toEqual([]);
  });
});

describe("Sorter: opening lists", () => {
  it("should abandon the previous list's sort and discard malformed saved answers", async () => {
    // GIVEN a sort in progress
    const s = sorterOf("a", "b", "c");
    await s.settled();
    // WHEN another list is opened whose log holds junk
    const junk = { ...emptyList("x"), items: [item("p"), item("q")], log: [["no-separator", 1], "bad"] as never };
    s.open(junk);
    await s.settled();
    // THEN only the new list is asked about, and the junk is gone
    const { a, b } = s.question!;
    expect([s.list.items[a]!.title, s.list.items[b]!.title].sort()).toEqual(["p", "q"]);
    expect(s.list.log).toEqual([]);
  });
});
