import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open } from "./harness.ts";

/** An app with the console API installed as `window.P`. */
const withConsole = () => open(`<pairwise-sorter></pairwise-sorter>`, `
  window.P = pwel.installConsole(document.querySelector("pairwise-sorter"), "P");
`);
/** Run `fn` against the console API in the page and return its (awaited) result. */
const P = (page: Page, fn: string): Promise<any> => page.evaluate(`(async () => { const P = window.P; return ${fn}; })()`);
/** Answer every question alphabetically through the API. */
const answerAll = (page: Page) => P(page, `(async () => { let st = P.state();
  while (st.pending) st = await P.answer(st.pending.a.title < st.pending.b.title ? "a" : "right"); return st; })()`);
const fails = (page: Page, fn: string) => page.evaluate(`(async () => { try { await window.P.${fn}; return "no error"; } catch (e) { return e.message; } })()`);

describe("installConsole", () => {
  it("should expose the API under the chosen name and describe itself", async () => {
    // GIVEN the API installed as P
    const page = await withConsole();
    // WHEN help is read
    const help = await P(page, "P.help()");
    // THEN it lists the surface
    expect(help).toStartWith("pairwiseSorter — rank a list by pairwise comparison.");
    expect(help).toContain("answer('a'|'b'|'equal')");
    expect(await P(page, "P.schema()")).toBe(2);
    await close(page);
  });

  it("should load items, answer to the end, and report state, ranking and comparisons", async () => {
    // GIVEN a named list loaded from strings and objects
    const page = await withConsole();
    const loaded = await P(page, `P.load(["cherry", { name: "apple", link: "https://ex.com/a", tags: ["red"] }, "banana"], { name: "Fruit" })`);
    // THEN the state names the list and the pending pair
    expect(loaded).toMatchObject({ list: "Fruit", screen: "compare", items: 3, active: 3, answered: 0, complete: false, tags: ["red"] });
    expect(loaded.pending.a.title).toBeString();
    // WHEN every question is answered
    const done = await answerAll(page);
    // THEN it is complete with a full ranking
    expect(done).toMatchObject({ screen: "done", complete: true, pending: null, conflicts: 0, ranking: ["apple", "banana", "cherry"] });
    expect(await P(page, "P.ranking()")).toEqual([
      { rank: 1, tied: false, title: "apple", url: "https://ex.com/a", media: [], desc: "", tags: ["red"] },
      { rank: 2, tied: false, title: "banana", url: "", media: [], desc: "", tags: [] },
      { rank: 3, tied: false, title: "cherry", url: "", media: [], desc: "", tags: [] },
    ]);
    const cmp = await P(page, "P.comparisons()");
    expect(cmp[0]).toMatchObject({ index: 0, conflicts: false, why: null });
    expect(await P(page, "P.conflicts()")).toEqual([]);
    expect(await P(page, "P.placement()")).toEqual({ placed: 3, total: 3, pct: 100 });
    await close(page);
  });

  it("should add items, set them from text, edit, tag and untag them", async () => {
    // GIVEN a sorted two-item list
    const page = await withConsole();
    await P(page, `P.load(["b", "a"])`);
    await answerAll(page);
    // WHEN one item is added
    const added = await P(page, `P.addItems(["c"])`);
    // THEN only it is asked about
    expect(added.items).toBe(3);
    await answerAll(page);
    // WHEN an item is edited, tagged and untagged
    await P(page, `P.editItem("a", { desc: "first" })`);
    await P(page, `P.tag("a", ["x", "y"])`);
    const untagged = await P(page, `P.untag("a", "#y")`);
    // THEN the changes landed
    expect(untagged.tags).toEqual(["x"]);
    expect((await P(page, "P.ranking()"))[0]).toMatchObject({ title: "a", desc: "first" });
    // WHEN the list is replaced from text
    const text = await P(page, `P.setItemsText("q\\nr")`);
    // THEN those are the items
    expect(text.items).toBe(2);
    await close(page);
  });

  it("should bench, sub in and sub all through titles", async () => {
    // GIVEN a sorted list
    const page = await withConsole();
    await P(page, `P.load(["a", "b", "c", "d"])`);
    await answerAll(page);
    // WHEN two are benched at once and one alone
    await P(page, `P.benchMany(["a", "b"])`);
    const one = await P(page, `P.bench("c")`);
    // THEN all three are benched
    expect(one.benched).toEqual(["a", "b", "c"]);
    // WHEN one is subbed in, then all
    await P(page, `P.subIn("a")`);
    const all = await P(page, `P.subAll()`);
    // THEN the bench is empty
    expect(all.benched).toEqual([]);
    await close(page);
  });

  it("should set tiers and weights, and find and drop overriding answers", async () => {
    // GIVEN art items beating fun items in the log
    const page = await withConsole();
    await P(page, `P.load([{ title: "a1", tags: ["art"] }, { title: "f1", tags: ["fun"] }])`);
    await answerAll(page);
    // WHEN fun is made the top tier, weighted
    await P(page, `P.setPriority([{ tag: "fun", weight: 3 }, "art"])`);
    // THEN the tiers read back, and the old answer is an override
    expect(await P(page, "P.priority()")).toEqual([{ tag: "fun", weight: 3 }, { tag: "art", weight: 1 }]);
    expect(await P(page, "P.overrides()")).toHaveLength(1);
    // WHEN overrides are dropped and weights turned on
    await P(page, `P.dropOverrides()`);
    const st = await P(page, `P.combineBy("weights")`);
    // THEN the tiers decide and combine by weight
    expect(st).toMatchObject({ tierOverrides: 0, combine: "weights", ranking: ["f1", "a1"] });
    expect(await P(page, "P.resolve()")).toEqual({ before: 0, after: 0 });
    await close(page);
  });

  it("should undo, delete a comparison, reset answers, pause, resume, go to screens and switch tabs", async () => {
    // GIVEN a sort in progress
    const page = await withConsole();
    await P(page, `P.load(["a", "b", "c", "d"])`);
    await P(page, `P.answer("left")`);
    await P(page, `P.answer("equal")`);
    // WHEN the last answer is undone and the first deleted
    await P(page, `P.undo()`);
    const del = await P(page, `P.deleteComparison(0)`);
    // THEN no answers are left
    expect(del.answered).toBe(0);
    // WHEN it pauses and resumes
    const paused = await P(page, `P.pause()`);
    const resumed = await P(page, `P.resume()`);
    // THEN it left the question and came back
    expect([paused.screen, paused.paused, resumed.screen]).toEqual(["done", true, "compare"]);
    // WHEN answers are reset, a screen is chosen and a tab switched
    await P(page, `P.answer("b")`);
    expect((await P(page, `P.resetAnswers()`)).answered).toBe(0);
    expect((await P(page, `P.goto("setup")`)).screen).toBe("setup");
    expect((await P(page, `P.tab("comparisons")`)).screen).toBe("setup");
    await close(page);
  });

  it("should create, open, rename, list and delete lists, by name or id", async () => {
    // GIVEN two lists
    const page = await withConsole();
    await P(page, `P.renameList("First")`);
    await P(page, `P.newList("Second")`);
    await P(page, `P.newList()`);
    // WHEN they are listed
    const lists = await P(page, "P.lists()");
    // THEN all three appear, the last current
    expect(lists.map((l: any) => [l.name, l.current])).toEqual([["First", false], ["Second", false], ["List 3", true]]);
    // WHEN one is opened by name and one deleted by id, then the current one deleted
    await P(page, `P.openList("First")`);
    await P(page, `P.deleteList(${JSON.stringify(lists[1].id)})`);
    const after = await P(page, `P.deleteList()`);
    // THEN only one list remains, and it is open
    expect(after.list).toBe("List 3");
    expect(await P(page, "P.lists()")).toHaveLength(1);
    await close(page);
  });

  it("should export and import", async () => {
    // GIVEN a sorted list
    const page = await withConsole();
    await P(page, `P.load(["b", "a"], { name: "Mine" })`);
    await answerAll(page);
    // WHEN it is exported and imported as a string and as an object
    const exp = await P(page, "P.exportJSON()");
    const fromString = await P(page, `P.importJSON(JSON.stringify(P.exportJSON()))`);
    const fromObject = await P(page, `P.importJSON({ items: ["x", "y"] })`);
    // THEN the export is readable, and each import lands as a new list
    expect(exp).toMatchObject({ format: "pairwise-sorter/3", name: "Mine", ranking: ["a", "b"] });
    expect(fromString.imported).toEqual({ items: 2, comparisons: 1, skipped: 0 });
    expect(fromObject.imported).toEqual({ items: 2, comparisons: 0, skipped: 0 });
    expect(await P(page, "P.lists()")).toHaveLength(3);
    await close(page);
  });

  it("should refuse bad input with a clear error rather than guessing", async () => {
    // GIVEN a list with two items titled the same apart from their links, and one benched-free list
    const page = await withConsole();
    await P(page, `P.load([{ title: "dup", url: "1" }, { title: "dup", url: "2" }, "solo"])`);
    await P(page, `P.newList("Other")`);
    await P(page, `P.newList("Other")`);
    // WHEN each bad call is made
    // THEN each fails with a reason
    expect(await fails(page, `load([])`)).toBe("no items given");
    expect(await fails(page, `load(["only"])`)).toBe("need at least 2 items in the list");
    expect(await fails(page, `openList("Other")`)).toStartWith('2 lists are named "Other"');
    await P(page, `P.openList(P.lists()[0].id)`);
    expect(await fails(page, `editItem("dup", {})`)).toBe('2 items are titled "dup" — titles must be unique to address one');
    expect(await fails(page, `editItem("nope", {})`)).toBe('no item titled "nope"');
    expect(await fails(page, `subIn("solo")`)).toBe('"solo" is not benched');
    expect(await fails(page, `answer("maybe")`)).toBe("answer expects 'a' | 'b' | 'equal'");
    expect(await fails(page, `deleteComparison(5)`)).toBe("no comparison at index 5");
    expect(await fails(page, `combineBy("sum")`)).toBe("combine expects 'order' or 'weights'");
    expect(await fails(page, `goto("elsewhere")`)).toBe("unknown screen: elsewhere");
    expect(await fails(page, `tab("other")`)).toBe("tab expects 'ranking' or 'comparisons'");
    expect(await fails(page, `resume()`)).toBe("nothing to resume");
    await P(page, `P.goto("setup")`);
    expect(await fails(page, `answer("a")`)).toBe("nothing is being asked right now — screen is setup");
    await P(page, `P.load(["p", "q"])`);
    await answerAll(page);
    expect(await fails(page, `pause()`)).toBe("nothing to pause — no question is open");
    await close(page);
  });

  it("should search, expand rows, and keep the old bench names", async () => {
    // GIVEN a sorted list where one item has a description
    const page = await withConsole();
    await P(page, `P.load([{ title: "apple", desc: "red" }, { title: "banana", desc: "yellow" }, "cherry"])`);
    await answerAll(page);
    // WHEN searching
    const st = await P(page, `P.search("an")`);
    // THEN the state carries the query
    expect(st.query).toBe("an");
    await P(page, `P.search()`);
    // WHEN a row is expanded, then all, then none
    await P(page, `P.expand("apple")`);
    const one = await page.$$eval("pairwise-sorter >>> pairwise-ranking >>> [part=detail]", (e) => e.length);
    await P(page, `P.expandAll()`);
    const all = await page.$$eval("pairwise-sorter >>> pairwise-ranking >>> [part=detail]", (e) => e.length);
    await P(page, `P.expand("apple", false)`);
    await P(page, `P.collapseAll()`);
    // THEN the rows opened and closed
    expect([one, all]).toEqual([1, 2]);
    expect(await page.$$eval("pairwise-sorter >>> pairwise-ranking >>> [part=detail]", (e) => e.length)).toBe(0);
    // THEN an item with nothing to show cannot be expanded
    expect(await fails(page, `expand("cherry")`)).toBe('"cherry" has no media or description to show');
    // WHEN the old names are used
    const removed = await P(page, `P.removeItem("cherry")`);
    const restored = await P(page, `P.restoreItem("cherry")`);
    // THEN they bench and sub in
    expect([removed.benched, restored.benched]).toEqual([["cherry"], []]);
    await close(page);
  });

  it("should retire finished items by title without asking anything", async () => {
    // GIVEN a sorted list
    const page = await withConsole();
    await P(page, `P.load(["c", "b", "d", "a", "e"])`);
    await answerAll(page);
    // WHEN c is retired
    const st = await P(page, `P.retire(["c"])`);
    // THEN it is gone, nothing is pending, and the order holds
    expect(st).toMatchObject({ items: 4, pending: null, ranking: ["a", "b", "d", "e"] });
    expect((await P(page, "P.comparisons()")).some((c: any) => c.implied)).toBe(true);
    await close(page);
  });

  it("should install under pairwiseSorter by default", async () => {
    // GIVEN the API installed without a name
    const page = await open(`<pairwise-sorter></pairwise-sorter>`, `pwel.installConsole(document.querySelector("pairwise-sorter"));`);
    // THEN it is on window.pairwiseSorter
    expect(await page.evaluate(() => typeof (window as any).pairwiseSorter.help)).toBe("function");
    await close(page);
  });
});
