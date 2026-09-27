import { describe, expect, it } from "bun:test";
import { close, open, text, texts } from "./harness.ts";

/** <pairwise-conflicts> over a sorter seeded with `said` answers: [winner, loser] or [x, y, "="]. */
const conflicts = (titles: string[], said: string[][]) => open(`<pairwise-conflicts></pairwise-conflicts>`, `
  const items = ${JSON.stringify(titles)}.map((t) => pw.item(t));
  const id = (t) => pw.idOf(pw.item(t));
  const log = ${JSON.stringify(said)}.map(([x, y, eq]) =>
    [pw.pairKeyOf(id(x), id(y)), eq ? 0 : -1 * pw.flipOfIds(id(x), id(y))]);
  const s = new pw.Sorter({ ...pw.emptyList("t"), items, log });
  window.s = s;
  document.querySelector("pairwise-conflicts").sorter = s;
  await s.settled();
`);

describe("<pairwise-conflicts>", () => {
  it("should list every answer readably, winner first, with ties shown as equal", async () => {
    // GIVEN a beats b, and b equals c
    const page = await conflicts(["a", "b", "c"], [["a", "b"], ["b", "c", "="]]);
    // WHEN the answers render
    // THEN each reads as a sentence
    expect(await texts(page, "pairwise-conflicts >>> [part~=answer] [part=pair]")).toEqual(["a › b", "b = c"]);
    // THEN there is no contradiction to report
    expect(await page.$eval("pairwise-conflicts >>> [part=banner]", (e) => (e as HTMLElement).hidden)).toBe(true);
    await close(page);
  });

  it("should say when there are no answers yet", async () => {
    // GIVEN a finished one-item list
    const page = await conflicts(["a"], []);
    // WHEN it renders
    // THEN it says so
    expect(await text(page, "pairwise-conflicts >>> [part=empty]")).toBe("No comparisons recorded yet.");
    await close(page);
  });

  it("should flag answers the ranking contradicts, and resolve them where an order can", async () => {
    // GIVEN a > b and b > c, plus "c beats a" said twice
    const page = await conflicts(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"], ["c", "a"]]);
    // WHEN it renders
    // THEN the banner counts the contradicted answers, and they are marked with why
    expect(await text(page, "pairwise-conflicts >>> [part=banner] span")).toBe("⚠ 2 answers contradict the ranking — your choices can't all be true at once.");
    expect(await texts(page, "pairwise-conflicts >>> [part~=conflict] [part=why]")).toEqual([
      "this answer disagrees with the final ranking", "this answer disagrees with the final ranking"]);
    // WHEN Resolve is pressed
    await page.click("pairwise-conflicts >>> [part=resolve]");
    // THEN it reports the reduction, and one answer is still contradicted
    expect(await text(page, "pairwise-conflicts >>> [part=result]")).toStartWith("Reordered — now contradicts 1 of your answers, down from 2.");
    expect(await text(page, "pairwise-conflicts >>> [part=banner] span")).toBe("⚠ 1 answer contradicts the ranking — your choices can't all be true at once.");
    // WHEN Resolve is pressed again
    await page.click("pairwise-conflicts >>> [part=resolve]");
    // THEN it explains that what remains is a genuine cycle
    expect(await text(page, "pairwise-conflicts >>> [part=result]")).toStartWith("Already as consistent as this search can make it — 1 answer still contradicted.");
    await close(page);
  });

  it("should count several answers left in a cycle no order can satisfy", async () => {
    // GIVEN a > b > c > a, every answer given twice
    const page = await conflicts(["a", "b", "c"], [["a", "b"], ["a", "b"], ["b", "c"], ["b", "c"], ["c", "a"], ["c", "a"]]);
    // WHEN Resolve is pressed
    await page.click("pairwise-conflicts >>> [part=resolve]");
    // THEN it reports both contradicted answers
    expect(await text(page, "pairwise-conflicts >>> [part=result]")).toStartWith("Already as consistent as this search can make it — 2 answers still contradicted.");
    await close(page);
  });

  it("should forget a deleted answer, clearing any earlier resolve note", async () => {
    // GIVEN a cycle a > b > c > a, resolved once
    const page = await conflicts(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
    await page.click("pairwise-conflicts >>> [part=resolve]");
    const note = await text(page, "pairwise-conflicts >>> [part=result]");
    // WHEN the cycle-closing answer is deleted
    await page.click("pairwise-conflicts >>> [part~=conflict] [part=delete]");
    await page.evaluate(() => (window as any).s.settled());
    // THEN two answers remain, none contradicted, and the stale note is gone
    expect(note).toStartWith("Already as consistent");
    expect(await texts(page, "pairwise-conflicts >>> [part~=answer] [part=pair]")).toEqual(["a › b", "b › c"]);
    expect(await page.$eval("pairwise-conflicts >>> [part=banner]", (e) => (e as HTMLElement).hidden)).toBe(true);
    expect(await page.$eval("pairwise-conflicts >>> [part=result]", (e) => (e as HTMLElement).hidden)).toBe(true);
    await close(page);
  });

  it("should render nothing without a sorter", async () => {
    // GIVEN no sorter
    const page = await open(`<pairwise-conflicts></pairwise-conflicts>`);
    // WHEN it renders
    // THEN no answers are listed
    expect(await page.$$eval("pairwise-conflicts >>> [part~=answer]", (e) => e.length)).toBe(0);
    await close(page);
  });

  it("should filter answers to those naming a matching item on either side", async () => {
    // GIVEN three answers
    const page = await conflicts(["apple", "banana", "cherry"], [["apple", "banana"], ["banana", "cherry"], ["apple", "cherry"]]);
    // WHEN filtered by "cher"
    await page.$eval("pairwise-conflicts", (el: any) => { el.query = "CHER"; });
    // THEN the two answers involving cherry show, counted
    expect(await texts(page, "pairwise-conflicts >>> [part~=answer]:not([hidden]) [part=pair]")).toEqual(["banana › cherry", "apple › cherry"]);
    expect(await text(page, "pairwise-conflicts >>> [part=count]")).toBe("showing 2 of 3");
    expect(await page.$eval("pairwise-conflicts", (el: any) => el.query)).toBe("CHER");
    // WHEN the filter is cleared
    await page.$eval("pairwise-conflicts", (el: any) => { el.query = ""; });
    // THEN all show and the count clears
    expect(await texts(page, "pairwise-conflicts >>> [part~=answer]:not([hidden]) [part=pair]")).toHaveLength(3);
    expect(await text(page, "pairwise-conflicts >>> [part=count]")).toBe("");
    await close(page);
  });

  it("should label answers that were filled in rather than given", async () => {
    // GIVEN c, b, d, a, e answered, then c retired
    const page = await conflicts(["c", "b", "d", "a", "e"], []);
    await page.evaluate(async () => {
      const s = (window as any).s;
      while (s.question) { const { a, b } = s.question; await s.answer(s.list.items[a].title < s.list.items[b].title ? -1 : 1); }
      await s.retire([(window as any).pw.idOf(s.list.items[0])]);
    });
    // WHEN the answers render
    const implied = await page.$$eval("pairwise-conflicts >>> [part~=answer]", (els) => els.map((e) => !!e.querySelector("[part=implied]")));
    // THEN the filled-in ones carry the label, and the given ones do not
    expect(implied.some(Boolean)).toBe(true);
    expect(implied.every(Boolean)).toBe(false);
    await close(page);
  });
});
