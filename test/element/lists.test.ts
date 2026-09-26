import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open, text } from "./harness.ts";

/** Resolve with the detail of the next `type` event from `selector`. */
const next = (page: Page, selector: string, type: string) => page.evaluate((sel, t) => new Promise((r) =>
  document.querySelector(sel)!.addEventListener(t, (e) => r((e as CustomEvent).detail ?? null), { once: true })), selector, type);

describe("<pairwise-lists>", () => {
  const lists = () => open(`<pairwise-lists></pairwise-lists>`, `
    const lib = pw.emptyLibrary();
    const a = pw.addList(lib, "Coffee"); lib.lists[a].items = [pw.item("x"), pw.item("y")];
    const b = pw.addList(lib, "Tea");
    lib.lists[pw.addList(lib)].name = "";
    lib.current = a;
    window.ids = { a, b };
    document.querySelector("pairwise-lists").library = lib;
  `);

  it("should show every list with its size, the current one selected and named", async () => {
    // GIVEN two lists with Coffee current
    const page = await lists();
    // WHEN it renders
    // THEN the picker lists both with item counts, and the name box holds the current name
    expect(await page.$$eval("pairwise-lists >>> [part=pick] option", (o) => o.map((e) => e.textContent))).toEqual(["Coffee (2)", "Tea (0)", "Untitled (0)"]);
    expect(await page.$eval("pairwise-lists >>> [part=pick]", (s) => (s as HTMLSelectElement).value)).toBe(await page.evaluate(() => (window as any).ids.a));
    expect(await page.$eval("pairwise-lists >>> [part=name]", (i) => (i as HTMLInputElement).value)).toBe("Coffee");
    await close(page);
  });

  it("should ask the host to open, create, rename and import lists", async () => {
    // GIVEN two lists
    const page = await lists();
    // WHEN another list is picked
    const opened = next(page, "pairwise-lists", "pairwise-list-open");
    await page.select("pairwise-lists >>> [part=pick]", await page.evaluate(() => (window as any).ids.b));
    // THEN the host is asked to open it
    expect(await opened).toEqual({ id: await page.evaluate(() => (window as any).ids.b) });
    // WHEN New list, a rename and Import are used
    const created = next(page, "pairwise-lists", "pairwise-list-new");
    await page.click("pairwise-lists >>> [part=new]");
    expect(await created).toBeNull();
    const renamed = next(page, "pairwise-lists", "pairwise-list-rename");
    await page.type("pairwise-lists >>> [part=name]", "!");
    expect(await renamed).toEqual({ name: "Coffee!" });
    const importing = next(page, "pairwise-lists", "pairwise-import");
    await page.click("pairwise-lists >>> [part=import]");
    // THEN each is asked for
    expect(await importing).toBeNull();
    await close(page);
  });

  it("should need two clicks to delete, and disarm after a pause", async () => {
    // GIVEN two lists
    const page = await lists();
    const deleted = page.evaluate(() => new Promise((r) => {
      let n = 0;
      document.querySelector("pairwise-lists")!.addEventListener("pairwise-list-delete", () => r(++n));
    }));
    // WHEN Delete is pressed once
    await page.click("pairwise-lists >>> [part=delete]");
    // THEN it asks to be sure
    expect(await text(page, "pairwise-lists >>> [part=delete]")).toBe("Really delete?");
    // WHEN the pause passes
    await page.evaluate(() => { (document.querySelector("pairwise-lists") as any).disarmAfter = 0; });
    await page.click("pairwise-lists >>> [part=delete]");
    // THEN a second press deletes
    expect(await deleted).toBe(1);
    expect(await text(page, "pairwise-lists >>> [part=delete]")).toBe("Delete");
    // WHEN Delete is pressed once and left alone
    await page.click("pairwise-lists >>> [part=delete]");
    await new Promise((r) => setTimeout(r, 50));
    // THEN it disarms
    expect(await text(page, "pairwise-lists >>> [part=delete]")).toBe("Delete");
    await close(page);
  });

  it("should render nothing without a library", async () => {
    // GIVEN no library
    const page = await open(`<pairwise-lists></pairwise-lists>`);
    // THEN the picker is empty
    expect(await page.$$eval("pairwise-lists >>> [part=pick] option", (o) => o.length)).toBe(0);
    await close(page);
  });
});

describe("<pairwise-io>", () => {
  const io = (view = "") => open(`<pairwise-io ${view}></pairwise-io>`, `
    const s = new pw.Sorter({ ...pw.emptyList("t"), items: [pw.item("a", "https://ex.com/a", [], "", ["t"]), pw.item("b")] });
    window.s = s;
    document.querySelector("pairwise-io").sorter = s;
    await s.settled();
  `);
  const box = "pairwise-io >>> [part=text]";

  it("should show the items as editable text and save edits, keeping answers for items that stay", async () => {
    // GIVEN two items, one answered pair
    const page = await io();
    await page.evaluate(() => (window as any).s.answer(-1));
    // WHEN it renders
    // THEN the box holds the items in the text syntax
    expect(await page.$eval(box, (t) => (t as HTMLTextAreaElement).value)).toBe("a | https://ex.com/a | #t\nb");
    // WHEN a line and a duplicate are added and saved
    const saved = next(page, "pairwise-io", "pairwise-saved");
    await page.$eval(box, (t) => { (t as HTMLTextAreaElement).value += "\nc\nc"; });
    await page.click("pairwise-io >>> [part=save]");
    await saved;
    // THEN the new item is added, the duplicate reported, and the old answer kept
    expect(await page.evaluate(() => (window as any).s.list.items.map((i: any) => i.title))).toEqual(["a", "b", "c"]);
    expect(await text(page, "pairwise-io >>> [part=hint]")).toBe("Merged 1 duplicate: c.");
    expect(await page.evaluate(() => (window as any).s.list.log.length)).toBe(1);
    await close(page);
  });

  it("should report answers dropped with deleted items, and refuse fewer than two items", async () => {
    // GIVEN a answered against b
    const page = await io();
    await page.evaluate(() => (window as any).s.answer(-1));
    // WHEN b is replaced by c and d
    await page.$eval(box, (t) => { (t as HTMLTextAreaElement).value = "a | https://ex.com/a | #t\nc\nd"; });
    await page.click("pairwise-io >>> [part=save]");
    // THEN the dropped answer is reported
    expect(await text(page, "pairwise-io >>> [part=hint]")).toBe("1 answer dropped with deleted items.");
    // WHEN everything but one line is deleted
    await page.$eval(box, (t) => { (t as HTMLTextAreaElement).value = "solo"; });
    await page.click("pairwise-io >>> [part=save]");
    // THEN it refuses
    expect(await text(page, "pairwise-io >>> [part=hint]")).toBe("need at least 2 distinct items");
    // WHEN it is reset from the list
    await page.evaluate(() => (document.querySelector("pairwise-io") as any).reset());
    // THEN the box shows the saved items again and the hint clears
    expect(await page.$eval(box, (t) => (t as HTMLTextAreaElement).value)).toBe("a | https://ex.com/a | #t\nc\nd");
    expect(await text(page, "pairwise-io >>> [part=hint]")).toBe("");
    await close(page);
  });

  it("should report several duplicates and several dropped answers together", async () => {
    // GIVEN a, b and c fully sorted
    const page = await io();
    await page.evaluate(async () => {
      const s = (window as any).s;
      await s.setItems([...s.list.items, (window as any).pw.item("c")]);
      while (s.question) await s.answer(-1);
    });
    // WHEN a is deleted and x, y each written twice
    await page.$eval(box, (t) => { (t as HTMLTextAreaElement).value = "b\nc\nx\nx\ny\ny"; });
    await page.click("pairwise-io >>> [part=save]");
    // THEN both are reported, pluralised
    expect(await text(page, "pairwise-io >>> [part=hint]")).toMatch(/^Merged 2 duplicates: x, y\. \d answers dropped with deleted items\.$/);
    await close(page);
  });

  it("should import an export as a new list, or say why it cannot", async () => {
    // GIVEN the import view
    const page = await io("view=import");
    // WHEN invalid JSON is imported
    await page.type(box, "{nope");
    await page.click("pairwise-io >>> [part=import]");
    // THEN the reason is shown
    expect(await text(page, "pairwise-io >>> [part=hint]")).toStartWith("Could not import:");
    // WHEN a valid export is imported
    const imported = next(page, "pairwise-io", "pairwise-imported");
    await page.$eval(box, (t) => { (t as HTMLTextAreaElement).value = JSON.stringify({ name: "Imp", items: ["p", "q"],
      comparisons: [{ a: { title: "p" }, b: { title: "q" }, verdict: -1 }, { a: { title: "p" }, b: { title: "zz" }, verdict: 1 }] }); });
    await page.click("pairwise-io >>> [part=import]");
    // THEN the host receives the list and the counts, and the box clears
    expect(await imported).toMatchObject({ list: { name: "Imp" }, count: 2, kept: 1, skipped: 1 });
    expect(await page.$eval(box, (t) => (t as HTMLTextAreaElement).value)).toBe("");
    // WHEN Cancel is pressed
    const cancelled = next(page, "pairwise-io", "pairwise-cancel");
    await page.click("pairwise-io >>> [part=cancel]");
    // THEN the host hears it
    expect(await cancelled).toBeNull();
    await close(page);
  });

  it("should show text it is handed, such as an export that could not be copied", async () => {
    // GIVEN the import view
    const page = await io("view=import");
    // WHEN the host shows some text with a note
    await page.evaluate(() => (document.querySelector("pairwise-io") as any).show('{"x":1}', "Copy failed — the export is below."));
    // THEN it is in the box with the note
    expect(await page.$eval(box, (t) => (t as HTMLTextAreaElement).value)).toBe('{"x":1}');
    expect(await text(page, "pairwise-io >>> [part=hint]")).toBe("Copy failed — the export is below.");
    await close(page);
  });
});
