import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open, text, texts } from "./harness.ts";

const S = "pairwise-sorter >>> ";
const app = (attrs = "", before = "") => open(`<pairwise-sorter ${attrs}></pairwise-sorter>`, `
  ${before}
  const el = document.querySelector("pairwise-sorter");
  window.el = el;
  window.changes = 0;
  el.addEventListener("pairwise-change", () => window.changes++);
  await el.sorter.settled();
`);
const screen = (page: Page) => page.evaluate(() => (window as any).el.screen as string);
const settle = (page: Page) => page.evaluate(() => (window as any).el.sorter.settled());
/** Type items into the setup box and save them. */
async function enter(page: Page, lines: string) {
  await page.$eval(S + "pairwise-io >>> [part=text]", (t, v) => { (t as HTMLTextAreaElement).value = v; }, lines);
  await page.click(S + "pairwise-io >>> [part=save]");
  await settle(page);
}
/** Answer every question alphabetically with the keyboard. */
async function sortAll(page: Page) {
  while (await page.evaluate(() => !!(window as any).el.sorter.question)) {
    const left = await page.evaluate(() => { const s = (window as any).el.sorter; return s.list.items[s.question.a].title < s.list.items[s.question.b].title; });
    await page.keyboard.press(left ? "ArrowLeft" : "ArrowRight");
    await settle(page);
  }
}
const ranked = (page: Page) => texts(page, S + "pairwise-ranking >>> [part~=row] [part~=title]");

describe("<pairwise-sorter>", () => {
  it("should take a list from text to a finished ranking", async () => {
    // GIVEN a fresh app
    const page = await app();
    // THEN it starts on setup with an empty list
    expect(await screen(page)).toBe("setup");
    // WHEN three items are entered and saved
    await enter(page, "cherry\napple\nbanana");
    // THEN it asks the first question
    expect(await screen(page)).toBe("compare");
    // WHEN every question is answered
    await sortAll(page);
    // THEN the ranking is shown, with counts on the tabs
    expect(await screen(page)).toBe("done");
    expect(await ranked(page)).toEqual(["apple", "banana", "cherry"]);
    expect(await text(page, S + "[part=tab-ranking]")).toBe("3 items");
    expect(await text(page, S + "[part=heading]")).toBe("Sorted — best first");
    // WHEN the comparisons tab is chosen, then the ranking tab again
    await page.click(S + "[part=tab-comparisons]");
    const heading = await text(page, S + "[part=heading]");
    const cmpShown = await page.$eval(S + "pairwise-conflicts", (e) => !(e as HTMLElement).hidden);
    await page.click(S + "[part=tab-ranking]");
    // THEN it switches between the answers and the ranking
    expect(heading).toBe("Comparisons you made");
    expect(cmpShown).toBe(true);
    expect(await page.$eval(S + "pairwise-ranking", (e) => !(e as HTMLElement).hidden)).toBe(true);
    // THEN every change was announced for saving
    expect(await page.evaluate(() => (window as any).changes)).toBeGreaterThan(0);
    await close(page);
  });

  it("should pause to show the list so far, then resume the same question", async () => {
    // GIVEN a sort in progress
    const page = await app();
    await enter(page, "a\nb\nc\nd");
    const asked = await page.evaluate(() => (window as any).el.sorter.question);
    // WHEN "See list so far" is pressed
    await page.click(S + "[part=pause]");
    // THEN the provisional list shows with a Resume button
    expect(await screen(page)).toBe("done");
    expect(await page.$eval(S + "[part=resume]", (b) => (b as HTMLElement).hidden)).toBe(false);
    // WHEN Resume is pressed
    await page.click(S + "[part=resume]");
    // THEN the same question is back
    expect(await screen(page)).toBe("compare");
    expect(await page.evaluate(() => (window as any).el.sorter.question)).toEqual(asked);
    // WHEN progress offers to stop, and the offer is taken
    await page.keyboard.press("ArrowLeft"); await settle(page);
    await page.keyboard.press("ArrowLeft"); await settle(page);
    await page.click(S + "pairwise-progress >>> [part=stop] button");
    // THEN it pauses too
    expect(await screen(page)).toBe("done");
    await close(page);
  });

  it("should undo, reset answers, and go back to editing the list", async () => {
    // GIVEN a finished sort
    const page = await app();
    await enter(page, "b\na");
    await sortAll(page);
    // WHEN Undo is pressed
    await page.click(S + "[part=undo]"); await settle(page);
    // THEN the question is asked again
    expect(await screen(page)).toBe("compare");
    // WHEN it is answered, then answers are reset
    await sortAll(page);
    await page.click(S + "[part=reset]"); await settle(page);
    // THEN everything is asked again
    expect(await page.evaluate(() => (window as any).el.sorter.list.log.length)).toBe(0);
    // WHEN Edit list is pressed
    await page.click(S + "[part=edit-list]");
    // THEN setup shows the current items as text
    expect(await screen(page)).toBe("setup");
    expect(await page.$eval(S + "pairwise-io >>> [part=text]", (t) => (t as HTMLTextAreaElement).value)).toBe("b\na");
    await close(page);
  });

  it("should edit an item from its card, ignoring answer keys while the editor is open", async () => {
    // GIVEN a question on screen
    const page = await app();
    await enter(page, "a\nb");
    // WHEN the left card's edit button is pressed
    await page.click(S + "pairwise-compare >>> [part~=edit-a]");
    // THEN the editor opens
    expect(await page.$eval(S + "pairwise-editor >>> dialog", (d) => (d as HTMLDialogElement).open)).toBe(true);
    // WHEN ← is pressed with focus on an editor button
    await page.focus(S + "pairwise-editor >>> [part=cancel]");
    await page.keyboard.press("ArrowLeft");
    // THEN no answer is cast
    expect(await page.evaluate(() => (window as any).el.sorter.list.log.length)).toBe(0);
    await close(page);
  });

  it("should bench from a card and show the bench only while something is on it", async () => {
    // GIVEN three items, none benched
    const page = await app();
    await enter(page, "a\nb\nc");
    expect(await page.$eval(S + "[part=bench-panel]", (e) => (e as HTMLElement).hidden)).toBe(true);
    // WHEN an item is benched from its card
    await page.click(S + "pairwise-compare >>> [part~=bench-a]"); await settle(page);
    // THEN the bench appears with it
    expect(await page.$eval(S + "[part=bench-panel]", (e) => (e as HTMLElement).hidden)).toBe(false);
    expect(await texts(page, S + "pairwise-bench >>> [part~=benched] [part=name]")).toHaveLength(1);
    await close(page);
  });

  it("should show the tier controls once items carry tags", async () => {
    // GIVEN tagged items, sorted
    const page = await app();
    await enter(page, "a | #x\nb | #y");
    await sortAll(page);
    // WHEN the results show
    // THEN the tiers panel is there
    expect(await page.$eval(S + "[part=tiers-panel]", (e) => (e as HTMLElement).hidden)).toBe(false);
    await close(page);
  });

  it("should manage several lists: create, switch, rename and delete", async () => {
    // GIVEN one list with items
    const page = await app();
    await enter(page, "a\nb");
    // WHEN a new list is created
    await page.click(S + "pairwise-lists >>> [part=new]");
    // THEN it is empty and on setup
    expect(await screen(page)).toBe("setup");
    expect(await page.$$eval(S + "pairwise-lists >>> option", (o) => o.map((e) => e.textContent))).toEqual(["List 1 (2)", "List 2 (0)"]);
    // WHEN it is renamed
    await page.type(S + "pairwise-lists >>> [part=name]", "!");
    expect(await page.evaluate(() => (window as any).el.sorter.list.name)).toBe("List 2!");
    // WHEN the first list is picked again
    const first = await page.$$eval(S + "pairwise-lists >>> option", (o) => (o[0] as HTMLOptionElement).value);
    await page.select(S + "pairwise-lists >>> [part=pick]", first);
    await settle(page);
    // THEN its question is back
    expect(await screen(page)).toBe("compare");
    // WHEN it is deleted, and then the last list is deleted too
    await page.click(S + "pairwise-lists >>> [part=delete]");
    await page.click(S + "pairwise-lists >>> [part=delete]");
    await page.click(S + "pairwise-lists >>> [part=delete]");
    await page.click(S + "pairwise-lists >>> [part=delete]");
    // THEN a fresh empty list takes its place
    expect(await page.$$eval(S + "pairwise-lists >>> option", (o) => o.length)).toBe(1);
    expect(await screen(page)).toBe("setup");
    await close(page);
  });

  it("should import an export as a new list, and cancel back to where it was", async () => {
    // GIVEN a list with items
    const page = await app();
    await enter(page, "a\nb");
    // WHEN Import is opened and cancelled
    await page.click(S + "pairwise-lists >>> [part=import]");
    const importing = await screen(page);
    await page.click(S + "pairwise-io[view=import] >>> [part=cancel]");
    // THEN it went to import and came back
    expect(importing).toBe("import");
    expect(await screen(page)).toBe("compare");
    // WHEN an export is imported
    await page.click(S + "pairwise-lists >>> [part=import]");
    await page.$eval(S + "pairwise-io[view=import] >>> [part=text]", (t) => {
      (t as HTMLTextAreaElement).value = JSON.stringify({ name: "Imp", items: ["x", "y"], comparisons: [{ a: { title: "x" }, b: { title: "y" }, verdict: -1 }] });
    });
    await page.click(S + "pairwise-io[view=import] >>> [part=import]");
    await settle(page);
    // THEN it opens as a new, already sorted list
    expect(await page.evaluate(() => (window as any).el.sorter.list.name)).toBe("Imp");
    expect(await screen(page)).toBe("done");
    expect(await ranked(page)).toEqual(["x", "y"]);
    await close(page);
  });

  it("should export to the clipboard, or into the import box when copying fails", async () => {
    // GIVEN a finished sort with clipboard access
    const page = await app();
    await page.browserContext().overridePermissions(new URL(page.url()).origin, ["clipboard-read", "clipboard-sanitized-write"]);
    await enter(page, "b\na");
    await sortAll(page);
    // WHEN Export is pressed
    await page.click(S + "[part=export]");
    await page.waitForFunction(() => (window as any).el.shadowRoot.querySelector("[part=export]").textContent === "Copied");
    // THEN the clipboard holds the export
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copied).toMatchObject({ format: "pairwise-sorter/3", ranking: ["a", "b"] });
    // THEN the button reads "Copied" only briefly
    await page.waitForFunction(() => (window as any).el.shadowRoot.querySelector("[part=export]").textContent === "Export JSON");
    // WHEN the clipboard refuses
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("denied")); });
    await page.click(S + "[part=export]");
    await page.waitForFunction(() => (window as any).el.screen === "import");
    // THEN the export is put in the import box to copy by hand
    expect(await text(page, S + "pairwise-io[view=import] >>> [part=hint]")).toBe("Copy failed — the export is in the box below; select it and copy.");
    expect(JSON.parse(await page.$eval(S + "pairwise-io[view=import] >>> [part=text]", (t) => (t as HTMLTextAreaElement).value)).format).toBe("pairwise-sorter/3");
    await close(page);
  });

  it("should restore lists from storage-key, including the original page's data", async () => {
    // GIVEN the original page's saved data under its key, then a reload
    const legacy = JSON.stringify({ current: "l1", lists: { l1: { name: "Old", items: [{ title: "p" }, { title: "q" }], log: [], removed: [] } } });
    const page = await app(`storage-key="pairwise-sorter/v4"`);
    const reload = async () => {
      await page.reload();
      await page.waitForFunction("window.__ready === true");
      await settle(page);
    };
    await page.evaluate((v) => localStorage.setItem("pairwise-sorter/v4", v), legacy);
    await reload();
    // THEN it opens that list, migrated
    expect(await page.evaluate(() => (window as any).el.sorter.list.name)).toBe("Old");
    // WHEN a question is answered and the page reloads
    await sortAll(page);
    await reload();
    // THEN the answer survived, saved at the current schema
    expect(await page.evaluate(() => (window as any).el.sorter.list.log.length)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pairwise-sorter/v4")!).version)).toBe(2);
    await close(page);
  });

  it("should take a library from its host, and go to any screen on request", async () => {
    // GIVEN an app
    const page = await app();
    // WHEN the host hands it a library
    await page.evaluate(async () => {
      const w = window as any, lib = w.pw.emptyLibrary();
      const id = w.pw.addList(lib, "Hosted");
      lib.lists[id].items = [w.pw.item("m"), w.pw.item("n")];
      w.el.library = lib;
      await w.el.sorter.settled();
    });
    // THEN it opens the library's current list
    expect(await page.evaluate(() => (window as any).el.library.lists[(window as any).el.library.current].name)).toBe("Hosted");
    expect(await screen(page)).toBe("compare");
    // WHEN each screen is requested
    const seen = [];
    for (const s of ["done", "compare", "import", "setup"]) {
      await page.evaluate((x) => (window as any).el.goto(x), s);
      seen.push(await screen(page));
    }
    // THEN each is shown, and "done" mid-sort counts as paused
    expect(seen).toEqual(["done", "compare", "import", "setup"]);
    // WHEN pause and resume are asked for with no question open
    await page.evaluate(async () => { const el = (window as any).el; el.goto("compare"); await el.sorter.answer(-1); });
    // THEN neither applies
    expect(await page.evaluate(() => [(window as any).el.pause(), (window as any).el.resume()])).toEqual([false, false]);
    await close(page);
  });

  /** Hand the app one list with the given items and saved answers ([winner, loser] titles). */
  const hosted = (page: Page, titles: string[], said: string[][]) => page.evaluate(async (t, a) => {
    const w = window as any, pw = w.pw, lib = pw.emptyLibrary(), id = pw.addList(lib, "Seeded");
    const key = (x: string) => pw.idOf(pw.item(x));
    lib.lists[id].items = t.map((x: string) => pw.item(x));
    lib.lists[id].log = a.map(([x, y]: any) => [pw.pairKeyOf(key(x), key(y)), -1 * pw.flipOfIds(key(x), key(y))]);
    w.el.library = lib;
    await w.el.sorter.settled();
  }, titles, said);

  it("should warn above the results when answers contradict the ranking, and resolve from there", async () => {
    // GIVEN a > b and b > c, plus "c beats a" said twice
    const page = await app();
    await hosted(page, ["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"], ["c", "a"]]);
    // WHEN the results show
    // THEN the warning counts the contradicted answers
    expect(await text(page, S + "[part=conflict-banner] span")).toBe("⚠ 2 answers contradict the ranking — your choices can't all be true at once.");
    // WHEN Resolve is pressed there
    await page.click(S + "[part=conflict-banner] [part=resolve]");
    // THEN the result is reported on the results, and one contradiction remains
    expect(await text(page, S + "[part=resolve-note]")).toStartWith("Reordered — now contradicts 1 of your answers, down from 2.");
    expect(await text(page, S + "[part=conflict-banner] span")).toBe("⚠ 1 answer contradicts the ranking — your choices can't all be true at once.");
    // WHEN Show them is pressed
    await page.click(S + "[part=conflict-banner] [part=show-conflicts]");
    // THEN the comparisons tab opens, without the banner
    expect(await text(page, S + "[part=heading]")).toBe("Comparisons you made");
    expect(await page.$eval(S + "[part=conflict-banner]", (e) => (e as HTMLElement).hidden)).toBe(true);
    // WHEN an answer is deleted there
    await page.click(S + "pairwise-conflicts >>> [part=delete]");
    await settle(page);
    // THEN the stale resolve note is gone
    expect(await page.$eval(S + "[part=resolve-note]", (e) => (e as HTMLElement).hidden)).toBe(true);
    await close(page);
  });

  it("should stay on the results when benching raises a new question, offering to resume", async () => {
    // GIVEN a finished sort where b stood between a and c
    const page = await app();
    await hosted(page, ["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    expect(await screen(page)).toBe("done");
    // WHEN b is benched from the ranking
    const b = await page.$$(S + "pairwise-ranking >>> [part~=bench]");
    await b[1]!.click();
    await settle(page);
    // THEN a vs c must now be asked, but the results stay up with Resume
    expect(await page.evaluate(() => !!(window as any).el.sorter.question)).toBe(true);
    expect(await screen(page)).toBe("done");
    expect(await page.$eval(S + "[part=resume]", (e) => (e as HTMLElement).hidden)).toBe(false);
    await close(page);
  });

  it("should filter the ranking, the answers, the bench and the items text from one search", async () => {
    // GIVEN a finished sort with one item benched
    const page = await app();
    await hosted(page, ["apple", "banana", "cherry", "apricot"], [["apple", "banana"], ["banana", "cherry"], ["apricot", "apple"]]);
    await sortAll(page);
    await page.evaluate(async () => { const w = window as any, s = w.el.sorter; await s.bench([w.pw.idOf(s.list.items.find((i: any) => i.title === "banana"))]); });
    await sortAll(page);
    // WHEN "ap" is typed into the results search
    await page.type(S + "[part=search]", "ap");
    // THEN the ranking, the answers and the bench all filter
    expect(await ranked(page).then((r) => r)).toEqual(expect.arrayContaining(["apricot", "apple"]));
    expect(await texts(page, S + "pairwise-ranking >>> [part~=row]:not([hidden]) [part~=title]")).toHaveLength(2);
    expect(await page.$eval(S + "pairwise-conflicts", (el: any) => el.query)).toBe("ap");
    expect(await page.$eval(S + "pairwise-bench", (el: any) => el.query)).toBe("ap");
    // WHEN the search is cleared with its button, then typed again
    await page.click(S + "[part=clear-search]");
    expect(await page.evaluate(() => (window as any).el.query)).toBe("");
    await page.type(S + "[part=search]", "ap");
    // WHEN the list is edited
    await page.click(S + "[part=edit-list]");
    // THEN the items text is filtered the same way
    expect(await page.$eval(S + "pairwise-io", (el: any) => el.query)).toBe("ap");
    // WHEN the filter is changed from the items screen
    await page.$eval(S + "pairwise-io >>> [part=filter]", (i) => { (i as HTMLInputElement).value = ""; i.dispatchEvent(new Event("input")); });
    // THEN the results search follows it
    expect(await page.$eval(S + "[part=search]", (i) => (i as HTMLInputElement).value)).toBe("");
    await close(page);
  });

  it("should clear the search when switching lists", async () => {
    // GIVEN a search typed on one list
    const page = await app();
    await enter(page, "a\nb");
    await sortAll(page);
    await page.type(S + "[part=search]", "a");
    // WHEN a new list is created
    await page.click(S + "pairwise-lists >>> [part=new]");
    // THEN the search is empty
    expect(await page.evaluate(() => (window as any).el.query)).toBe("");
    await close(page);
  });
});
