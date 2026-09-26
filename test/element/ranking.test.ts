import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open, text, texts } from "./harness.ts";

/**
 * A page with <pairwise-ranking> over a sorter whose `items` are pw.item args. `answer` is a
 * JS expression choosing a verdict for (A, B) titles; the sort is answered to the end unless
 * `stopAfter` answers are given first.
 */
const ranking = (items: unknown[][], { answer = "A < B ? -1 : 1", stopAfter = Infinity, extra = "" } = {}) =>
  open(`<pairwise-ranking></pairwise-ranking>`, `
  const s = new pw.Sorter({ ...pw.emptyList("t"), items: ${JSON.stringify(items)}.map((a) => pw.item(...a)) });
  window.s = s;
  ${extra}
  document.querySelector("pairwise-ranking").sorter = s;
  await s.settled();
  let n = 0;
  while (s.question && n++ < ${stopAfter === Infinity ? "1e9" : stopAfter}) {
    const A = s.list.items[s.question.a].title, B = s.list.items[s.question.b].title;
    await s.answer(${answer});
  }
`);
const rows = (page: Page) => texts(page, "pairwise-ranking >>> [part~=row]:not([hidden]) [part~=title]");
const ranks = (page: Page) => texts(page, "pairwise-ranking >>> [part~=row]:not([hidden]) [part~=rank]");

describe("<pairwise-ranking>", () => {
  it("should list the finished ranking best first, sharing a rank between tied items", async () => {
    // GIVEN a sort where b and c were called equal
    const page = await ranking([["c"], ["a"], ["b"], ["d"]], { answer: `(A + B === "bc" || A + B === "cb") ? 0 : A < B ? -1 : 1` });
    // WHEN the ranking renders
    // THEN it is ordered — a tie places the newcomer after its equal — with the pair sharing rank 2
    expect(await rows(page)).toEqual(["a", "c", "b", "d"]);
    expect(await ranks(page)).toEqual(["1", "2", "=", "4"]);
    await close(page);
  });

  it("should mark a mid-sort ranking as provisional and list the unplaced items", async () => {
    // GIVEN a sort one answer in
    const page = await ranking([["c"], ["a"], ["b"], ["d"]], { stopAfter: 1 });
    // WHEN the ranking renders
    // THEN it shows the placed items and says the order is provisional
    expect(await rows(page)).toEqual(["a", "c"]);
    expect(await text(page, "pairwise-ranking >>> [part=partial]")).toBe(
      "Sorting in progress — 2 of 4 placed so far. This order is provisional; the rest slot in as you keep answering.");
    expect(await texts(page, "pairwise-ranking >>> [part=unplaced] li")).toEqual(["b", "d"]);
    await close(page);
  });

  it("should draw a rule between strict tiers, and say which positions the tiers asserted", async () => {
    // GIVEN two tiers and an untiered item, strictly ordered
    const page = await ranking([["x", "", [], "", ["top"]], ["y", "", [], "", ["low"]], ["z"]], { extra: `await s.setPriority(["top", "low"]);` });
    // WHEN the ranking renders
    // THEN each tier opens with a rule, and a note explains them
    expect(await texts(page, "pairwise-ranking >>> [part=rule]")).toEqual(["#top", "#low", "untiered"]);
    expect(await text(page, "pairwise-ranking >>> [part=note]")).toStartWith("Tiers are on, so cross-tier positions come from the tier order");
    // WHEN tiers combine by weight instead
    await page.evaluate(() => (window as any).s.setCombine("weights"));
    // THEN the rules go, since tiers interleave, and the note says weights decide
    expect(await page.$$eval("pairwise-ranking >>> [part=rule]", (e) => e.length)).toBe(0);
    expect(await text(page, "pairwise-ranking >>> [part=note]")).toStartWith("Tiers are on, so positions across tiers come from the weights");
    await close(page);
  });

  it("should expand rows that have media or a description, one at a time or all at once", async () => {
    // GIVEN one item with media and a description, one with only a description, and a plain one
    const page = await ranking([["a", "", ["/test/element/px.svg?r1", "/v.mp4"], "about a"], ["b", "", [], "about b"], ["c"]]);
    // WHEN the first row's title is pressed
    await page.click("pairwise-ranking >>> button[part~=title]");
    // THEN its detail shows the media and description
    expect(await text(page, "pairwise-ranking >>> [part=detail]")).toBe("about a");
    expect(await page.$$eval("pairwise-ranking >>> [part=detail] img, pairwise-ranking >>> [part=detail] video", (e) => e.length)).toBe(2);
    // THEN a plain row has nothing to expand
    expect(await page.$$eval("pairwise-ranking >>> button[part~=title]", (e) => e.length)).toBe(2);
    // WHEN everything is expanded, then collapsed
    await page.click("pairwise-ranking >>> [part=expand-all]");
    const all = await page.$$eval("pairwise-ranking >>> [part=detail]", (e) => e.length);
    await page.click("pairwise-ranking >>> [part=collapse-all]");
    // THEN both expandable rows opened, and then none are
    expect(all).toBe(2);
    expect(await page.$$eval("pairwise-ranking >>> [part=detail]", (e) => e.length)).toBe(0);
    // WHEN a row is opened and pressed again
    await page.click("pairwise-ranking >>> button[part~=title]");
    await page.click("pairwise-ranking >>> button[part~=title]");
    // THEN it closes
    expect(await page.$$eval("pairwise-ranking >>> [part=detail]", (e) => e.length)).toBe(0);
    await close(page);
  });

  it("should enlarge an expanded row's image and step only through that item's images", async () => {
    // GIVEN an expanded item with two images, and another item with one
    const page = await ranking([["a", "", ["/test/element/px.svg?r2", "/test/element/px.svg?r3"]], ["b", "", ["/test/element/px.svg?r4"]]]);
    await page.click("pairwise-ranking >>> [part=expand-all]");
    // WHEN the first image is clicked
    await page.click("pairwise-ranking >>> [part=detail] img");
    // THEN the lightbox counts only that item's images
    expect(await text(page, "pairwise-ranking >>> [part=lightbox] .count")).toBe("1 / 2");
    // WHEN → then Escape are pressed
    await page.keyboard.press("ArrowRight");
    const second = await text(page, "pairwise-ranking >>> [part=lightbox] .count");
    await page.keyboard.press("Escape");
    // THEN it stepped, then closed
    expect(second).toBe("2 / 2");
    expect(await page.$eval("pairwise-ranking >>> [part=lightbox]", (e) => (e as HTMLElement).hidden)).toBe(true);
    // WHEN a key is pressed with the lightbox closed
    await page.keyboard.press("ArrowRight");
    // THEN nothing opens
    expect(await page.$eval("pairwise-ranking >>> [part=lightbox]", (e) => (e as HTMLElement).hidden)).toBe(true);
    await close(page);
  });

  it("should filter rows by title without changing ranks, and hide a tier left empty", async () => {
    // GIVEN a tiered ranking
    const page = await ranking([["apple", "", [], "", ["top"]], ["banana", "", [], "", ["low"]], ["apricot", "", [], "", ["top"]]],
      { extra: `await s.setPriority(["top", "low"]);` });
    // WHEN "ap" is searched
    await page.type("pairwise-ranking >>> [part=search]", "AP");
    // THEN only matching rows show, keeping their true ranks
    expect(await rows(page)).toEqual(["apple", "apricot"]);
    expect(await ranks(page)).toEqual(["1", "2"]);
    expect(await text(page, "pairwise-ranking >>> [part=count]")).toBe("showing 2 of 3");
    // THEN the tier whose rows are all hidden loses its rule
    expect(await texts(page, "pairwise-ranking >>> [part=rule]:not([hidden])")).toEqual(["#top"]);
    // WHEN the filter is cleared
    await page.click("pairwise-ranking >>> [part=clear]");
    // THEN everything shows again
    expect(await rows(page)).toEqual(["apple", "apricot", "banana"]);
    expect(await text(page, "pairwise-ranking >>> [part=count]")).toBe("");
    await close(page);
  });

  it("should bench a row, ask the host to edit one, and link out when an item has a url", async () => {
    // GIVEN a finished ranking where one item has a link and a <script> title
    const page = await ranking([["<i>a</i>", "https://ex.com/a"], ["b"], ["c"]]);
    const edited = page.evaluate(() => new Promise((r) =>
      document.querySelector("pairwise-ranking")!.addEventListener("pairwise-edit", (e) => r((e as CustomEvent).detail))));
    // WHEN the rows render
    // THEN the markup title is text, and only it has a link
    expect((await rows(page))[0]).toBe("<i>a</i>");
    expect(await page.$$eval("pairwise-ranking >>> [part~=open]", (e) => e.map((a) => (a as HTMLAnchorElement).href))).toEqual(["https://ex.com/a"]);
    // WHEN a row's rank is clicked
    await page.click("pairwise-ranking >>> [part~=rank]");
    // THEN nothing happens to the list
    expect(await rows(page)).toEqual(["<i>a</i>", "b", "c"]);
    // WHEN a row's edit button is pressed
    await page.click("pairwise-ranking >>> [part~=edit]");
    // THEN the host is told the item's index
    expect(await edited).toEqual({ index: 0 });
    // WHEN a row's bench button is pressed
    await page.click("pairwise-ranking >>> [part~=bench]");
    await page.evaluate(() => (window as any).s.settled());
    // THEN that item leaves the ranking
    expect(await page.evaluate(() => (window as any).s.benchedItems().map((i: any) => i.title))).toEqual(["<i>a</i>"]);
    await close(page);
  });

  it("should render nothing without a sorter", async () => {
    // GIVEN an element with no sorter
    const page = await open(`<pairwise-ranking></pairwise-ranking>`);
    // WHEN it renders
    // THEN its list is empty
    expect(await page.$$eval("pairwise-ranking >>> [part~=row]", (e) => e.length)).toBe(0);
    await close(page);
  });
});
