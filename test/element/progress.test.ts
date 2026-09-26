import { describe, expect, it } from "bun:test";
import { close, open, text } from "./harness.ts";

/** A page with a sorter over `titles` wired to one element, answering questions by title. */
const withSorter = (tag: string, titles: string[]) => open(`<${tag}></${tag}>`, `
  const s = new pw.Sorter({ ...pw.emptyList("t"), items: ${JSON.stringify(titles)}.map((t) => pw.item(t)) });
  document.querySelector("${tag}").sorter = s;
  window.s = s;
  window.answerOne = async () => { const { a, b } = s.question; await s.answer(s.list.items[a].title < s.list.items[b].title ? -1 : 1); };
  await s.settled();
`);

describe("<pairwise-progress>", () => {
  it("should show answers against the worst case, and how many items are placed", async () => {
    // GIVEN a sorter over four items, one answer in
    const page = await withSorter("pairwise-progress", ["d", "c", "b", "a"]);
    await page.evaluate(() => (window as any).answerOne());

    // WHEN the progress is read
    const status = await text(page, "pairwise-progress >>> [part=status]");
    const width = await page.$eval("pairwise-progress >>> [part=fill]", (el) => (el as HTMLElement).style.width);

    // THEN it counts answers against the budget and placed items
    expect(status).toBe("1 of ~5 comparisons · 2 of 4 placed");
    // THEN the bar is that fraction full
    expect(width).toBe("20%");
    await close(page);
  });

  it("should offer to stop once half the items are placed, and say so with an event", async () => {
    // GIVEN a sort far enough along that stopping keeps most items
    const page = await withSorter("pairwise-progress", ["a", "b", "c", "d", "e", "f"]);
    for (let i = 0; i < 4; i++) await page.evaluate(() => (window as any).answerOne());
    const stopped = page.evaluate(() => new Promise((r) => document.querySelector("pairwise-progress")!.addEventListener("pairwise-stop", () => r("stop"))));

    // WHEN the stop button is pressed
    const note = await text(page, "pairwise-progress >>> [part=stop]");
    await page.click("pairwise-progress >>> [part=stop] button");

    // THEN the note explains that placed items are final
    expect(note).toContain("placed items are already in their final order");
    // THEN the host hears pairwise-stop
    expect(await stopped).toBe("stop");
    await close(page);
  });

  it("should read complete when the sort is done, and render nothing without a sorter", async () => {
    // GIVEN a finished two-item sort, and a second element with no sorter
    const page = await withSorter("pairwise-progress", ["b", "a"]);
    await page.evaluate(() => document.body.append(document.createElement("pairwise-progress")));
    await page.evaluate(() => (window as any).answerOne());

    // WHEN both are read
    const done = await text(page, "pairwise-progress >>> [part=status]");
    const empty = await page.evaluate(() => document.querySelectorAll("pairwise-progress")[1]!.shadowRoot!.textContent!.trim());

    // THEN the first reads complete and hides the stop offer
    expect(done).toBe("1 of ~1 comparisons · 2 of 2 placed");
    expect(await page.$eval("pairwise-progress >>> [part=stop]", (el) => (el as HTMLElement).hidden)).toBe(true);
    // THEN the second is empty
    expect(empty).toBe("");
    await close(page);
  });

  it("should follow a new sorter and stop listening to the old one", async () => {
    // GIVEN an element showing one sorter
    const page = await withSorter("pairwise-progress", ["b", "a"]);
    // WHEN it is given a second sorter, and the first one is then answered
    await page.evaluate(async () => {
      const w = window as any;
      const other = new w.pw.Sorter({ ...w.pw.emptyList("o"), items: ["x", "y", "z"].map((t: string) => w.pw.item(t)) });
      document.querySelector("pairwise-progress")!.sorter = other;
      await other.settled();
      await w.answerOne();
    });
    // THEN it shows the second sorter, untouched by the first
    expect(await text(page, "pairwise-progress >>> [part=status]")).toBe("0 of ~3 comparisons · 1 of 3 placed");
    await close(page);
  });
});

