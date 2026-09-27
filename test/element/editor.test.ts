import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open, text, texts } from "./harness.ts";

/** A finished sorter over a, b, c (b tagged "x") shown by `tag`. */
const withList = (tag: string, setup = "") => open(`<${tag}></${tag}>`, `
  const s = new pw.Sorter({ ...pw.emptyList("t"), items: [pw.item("a", "", ["/m1.png", "/m2.png"], "desc a", ["x"]), pw.item("b", "", [], "", ["y"]), pw.item("c")] });
  window.s = s;
  window.finish = async () => { await s.settled(); while (s.question) {
    const A = s.list.items[s.question.a].title, B = s.list.items[s.question.b].title;
    await s.answer(A < B ? -1 : 1); } };
  ${setup}
  document.querySelector("${tag}").sorter = s;
  await finish();
`);
const item = (page: Page, i: number) => page.evaluate((n) => (window as any).s.list.items[n], i);
const finish = (page: Page) => page.evaluate(() => (window as any).finish());

describe("<pairwise-bench>", () => {
  it("should list benched items, sub one back in, sub them all in, and ask the host to edit one", async () => {
    // GIVEN a and b benched
    const page = await withList("pairwise-bench", `await s.bench([pw.idOf(s.list.items[0]), pw.idOf(s.list.items[1])]);`);
    const edited = page.evaluate(() => new Promise((r) =>
      document.querySelector("pairwise-bench")!.addEventListener("pairwise-edit", (e) => r((e as CustomEvent).detail))));
    // WHEN it renders
    // THEN it counts and lists them
    expect(await text(page, "pairwise-bench >>> [part=count]")).toBe("2");
    expect(await texts(page, "pairwise-bench >>> [part~=benched] [part=name]")).toEqual(["a", "b"]);
    // WHEN a benched item's edit button is pressed
    await page.click("pairwise-bench >>> [part~=benched] [part=edit]");
    // THEN the host is told its index
    expect(await edited).toEqual({ index: 0 });
    // WHEN a is subbed in
    await page.click("pairwise-bench >>> [part~=benched] [part=sub-in]");
    await finish(page);
    // THEN only b stays benched
    expect(await texts(page, "pairwise-bench >>> [part~=benched] [part=name]")).toEqual(["b"]);
    // WHEN the list's name is clicked, then everything is subbed in
    await page.click("pairwise-bench >>> [part~=benched] [part=name]");
    await page.click("pairwise-bench >>> [part=sub-all]");
    await finish(page);
    // THEN the bench is empty and says so
    expect(await text(page, "pairwise-bench >>> [part=count]")).toBe("0");
    expect(await page.$$eval("pairwise-bench >>> [part~=benched]", (e) => e.length)).toBe(0);
    await close(page);
  });

  it("should filter the bench by title", async () => {
    // GIVEN a and b benched
    const page = await withList("pairwise-bench", `await s.bench([pw.idOf(s.list.items[0]), pw.idOf(s.list.items[1])]);`);
    // WHEN filtered by "B"
    await page.$eval("pairwise-bench", (el: any) => { el.query = "B"; });
    // THEN only b shows
    expect(await texts(page, "pairwise-bench >>> [part~=benched]:not([hidden]) [part=name]")).toEqual(["b"]);
    expect(await page.$eval("pairwise-bench", (el: any) => el.query)).toBe("B");
    await close(page);
  });

  it("should render nothing without a sorter", async () => {
    // GIVEN no sorter
    const page = await open(`<pairwise-bench></pairwise-bench>`);
    // THEN the count is zero
    expect(await text(page, "pairwise-bench >>> [part=count]")).toBe("0");
    await close(page);
  });
});

describe("<pairwise-editor>", () => {
  const edit = async (page: Page, i: number) => page.evaluate((n) => (document.querySelector("pairwise-editor") as any).edit(n), i);
  const field = (name: string) => `pairwise-editor >>> [part=${name}]`;

  it("should open on an item's fields and save changes, carrying its answers across a rename", async () => {
    // GIVEN the editor on item a
    const page = await withList("pairwise-editor");
    await edit(page, 0);
    // THEN the form shows a's fields, tags and media
    expect(await page.$eval(field("title"), (i) => (i as HTMLInputElement).value)).toBe("a");
    expect(await page.$eval(field("desc"), (i) => (i as HTMLTextAreaElement).value)).toBe("desc a");
    expect(await texts(page, "pairwise-editor >>> [part=tags] .tag")).toEqual(["#x ×"]);
    expect(await page.$$eval("pairwise-editor >>> [part~=media-url]", (e) => e.map((i) => (i as HTMLInputElement).value))).toEqual(["/m1.png", "/m2.png"]);
    // THEN tags already used in the list are offered
    expect(await page.$$eval("pairwise-editor >>> datalist option", (e) => e.map((o) => (o as HTMLOptionElement).value))).toEqual(["x", "y"]);
    // WHEN the title, link and description are changed and saved
    await page.click(field("title"), { count: 3 }); await page.type(field("title"), "aa");
    await page.type(field("url"), "https://ex.com/aa");
    await page.click(field("desc"), { count: 3 }); await page.type(field("desc"), "new desc");
    await page.click(field("save"));
    await finish(page);
    // THEN the item changed, the dialog closed, and nothing was re-asked
    expect(await item(page, 0)).toMatchObject({ title: "aa", url: "https://ex.com/aa", desc: "new desc" });
    expect(await page.$eval(field("dialog"), (d) => (d as HTMLDialogElement).open)).toBe(false);
    expect(await page.evaluate(() => (window as any).s.question)).toBeNull();
    await close(page);
  });

  it("should add tags by Enter, by comma list and by button, remove one, and count one left typed", async () => {
    // GIVEN the editor on item c, which has no tags
    const page = await withList("pairwise-editor");
    await edit(page, 2);
    expect(await text(page, "pairwise-editor >>> [part=tags]")).toBe("No tags yet.");
    // WHEN "open world" is typed and Enter pressed, then "p, q" added with the button
    await page.type(field("tag-input"), "open world");
    await page.keyboard.press("Enter");
    await page.type(field("tag-input"), "p, q, p");
    await page.click(field("tag-add"));
    // THEN the chips are hyphenated and unique
    expect(await texts(page, "pairwise-editor >>> [part=tags] .tag")).toEqual(["#open-world ×", "#p ×", "#q ×"]);
    // WHEN p is removed, a key other than Enter is typed, and "z" is left typed when saving
    await page.click("pairwise-editor >>> [part=tags] .tag:nth-child(2) button");
    await page.type(field("tag-input"), "z");
    await page.click(field("save"));
    await finish(page);
    // THEN the saved tags include the typed one
    expect((await item(page, 2)).tags).toEqual(["open-world", "q", "z"]);
    await close(page);
  });

  it("should add, reorder and remove media", async () => {
    // GIVEN the editor on item a with two media URLs
    const page = await withList("pairwise-editor");
    await edit(page, 0);
    // THEN the first cannot move up and the last cannot move down
    const disabled = await page.$$eval("pairwise-editor >>> [part~=media] button:disabled", (e) => e.map((b) => b.getAttribute("aria-label")));
    expect(disabled).toEqual(["Move media 1 up", "Move media 2 down"]);
    // WHEN the second moves up, a third is added, and the first is removed
    await page.click("pairwise-editor >>> [aria-label='Media URL 1']");
    await page.click("pairwise-editor >>> [aria-label='Move media 2 up']");
    await page.click(field("media-add"));
    await page.type("pairwise-editor >>> [aria-label='Media URL 3']", "/m3.png");
    await page.click("pairwise-editor >>> [aria-label='Remove media 1']");
    await page.click("pairwise-editor >>> [aria-label='Move media 1 down']");
    await page.click(field("save"));
    await finish(page);
    // THEN the media are saved in the new order, blanks dropped
    expect((await item(page, 0)).media).toEqual(["/m3.png", "/m1.png"]);
    await close(page);
  });

  it("should say why it cannot save, and close without saving on Cancel", async () => {
    // GIVEN the editor on item a, and on an item with no media
    const page = await withList("pairwise-editor");
    await edit(page, 1);
    expect(await text(page, "pairwise-editor >>> [part=media-list]")).toBe("No media yet.");
    await edit(page, 0);
    // WHEN a is renamed onto b
    await page.click(field("title"), { count: 3 }); await page.type(field("title"), "b");
    await page.click(field("save"));
    // THEN the error says so and the dialog stays open
    expect(await text(page, "pairwise-editor >>> [part=error]")).toBe("another item already has that title and link");
    expect(await page.$eval(field("dialog"), (d) => (d as HTMLDialogElement).open)).toBe(true);
    // WHEN Cancel is pressed
    await page.click(field("cancel"));
    // THEN nothing changed
    expect((await item(page, 0)).title).toBe("a");
    expect(await page.$eval(field("dialog"), (d) => (d as HTMLDialogElement).open)).toBe(false);
    // WHEN asked to edit an item that does not exist
    await edit(page, 9);
    // THEN it does not open
    expect(await page.$eval(field("dialog"), (d) => (d as HTMLDialogElement).open)).toBe(false);
    await close(page);
  });
});
