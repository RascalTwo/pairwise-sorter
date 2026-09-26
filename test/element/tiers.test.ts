import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open, text, texts } from "./harness.ts";

/** A tiered-items sorter shown by `tag`, answered alphabetically to the end. `setup` runs first. */
const tiered = (tag: string, setup = "", items = `[["a1","",[],"",["art"]],["f1","",[],"",["fun"]],["a2","",[],"",["art"]],["n1","",[],"",["new"]]]`) =>
  open(`<${tag}></${tag}>`, `
  const s = new pw.Sorter({ ...pw.emptyList("t"), items: ${items}.map((a) => pw.item(...a)) });
  window.s = s;
  window.finish = async () => { await s.settled(); while (s.question) {
    const A = s.list.items[s.question.a].title, B = s.list.items[s.question.b].title;
    await s.answer(A < B ? -1 : 1); } };
  ${setup}
  document.querySelector("${tag}").sorter = s;
  await finish();
`);
const priority = (page: Page) => page.evaluate(() => (window as any).s.list.priority as string[]);
const weights = (page: Page) => page.evaluate(() => (window as any).s.list.weights as number[]);
const finish = (page: Page) => page.evaluate(() => (window as any).finish());

describe("<pairwise-tiers>", () => {
  it("should add tiers from the tags items carry, in the order added", async () => {
    // GIVEN items tagged art, fun and new, and no tiers
    const page = await tiered("pairwise-tiers");
    // WHEN it renders
    // THEN tiers read as off and every tag can be added
    expect(await text(page, "pairwise-tiers >>> [part=summary]")).toBe("off");
    expect(await texts(page, "pairwise-tiers >>> [part=add-tag] option")).toEqual(["#art", "#fun", "#new"]);
    // WHEN fun and then art are added
    await page.select("pairwise-tiers >>> [part=add-tag]", "fun");
    await page.click("pairwise-tiers >>> [part=add]");
    await finish(page);
    await page.select("pairwise-tiers >>> [part=add-tag]", "art");
    await page.click("pairwise-tiers >>> [part=add]");
    await finish(page);
    // THEN they are the tiers, best first, and only new is left to add
    expect(await priority(page)).toEqual(["fun", "art"]);
    expect(await text(page, "pairwise-tiers >>> [part=summary]")).toBe("#fun › #art");
    expect(await texts(page, "pairwise-tiers >>> [part~=tier] [part=name]")).toEqual(["#fun", "#art"]);
    expect(await texts(page, "pairwise-tiers >>> [part=add-tag] option")).toEqual(["#new"]);
    await close(page);
  });

  it("should reorder and remove tiers, carrying each tier's weight with it", async () => {
    // GIVEN three weighted tiers
    const page = await tiered("pairwise-tiers", `await s.setPriority([{ tag: "art", weight: 1 }, { tag: "fun", weight: 2 }, { tag: "new", weight: 3 }]);`);
    // THEN the ends cannot move further out
    expect(await page.$eval("pairwise-tiers >>> [part~=tier] [part=up]", (b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // WHEN a tier's name is clicked
    await page.click("pairwise-tiers >>> [part~=tier] [part=name]");
    // THEN nothing changes
    expect(await priority(page)).toEqual(["art", "fun", "new"]);
    // WHEN the first tier moves down
    await page.click("pairwise-tiers >>> [part~=tier] [part=down]");
    await finish(page);
    // THEN it swaps with the second, weight and all
    expect(await priority(page)).toEqual(["fun", "art", "new"]);
    expect(await weights(page)).toEqual([2, 1, 3]);
    // WHEN the last tier moves up
    const ups = await page.$$("pairwise-tiers >>> [part~=tier] [part=up]");
    await ups[2]!.click();
    await finish(page);
    // THEN it swaps with the one above
    expect(await priority(page)).toEqual(["fun", "new", "art"]);
    // WHEN the first tier is removed
    await page.click("pairwise-tiers >>> [part~=tier] [part=remove]");
    await finish(page);
    // THEN the rest keep their order and weights, and it can be added again
    expect(await priority(page)).toEqual(["new", "art"]);
    expect(await weights(page)).toEqual([3, 1]);
    expect(await texts(page, "pairwise-tiers >>> [part=add-tag] option")).toEqual(["#fun"]);
    await close(page);
  });

  it("should disable adding once every tag is a tier, and explain when no item has tags", async () => {
    // GIVEN every tag already a tier
    const page = await tiered("pairwise-tiers", `await s.setPriority(["art", "fun", "new"]);`);
    // WHEN it renders
    // THEN there is nothing to add
    expect(await page.$eval("pairwise-tiers >>> [part=add]", (b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await close(page);
    // GIVEN items with no tags at all
    const bare = await tiered("pairwise-tiers", "", `[["a"],["b"]]`);
    // THEN it says tiers need tags
    expect(await text(bare, "pairwise-tiers >>> [part=untagged]")).toBe("Tag items to use tiers: a higher tier then outranks a lower one without being asked.");
    await close(bare);
  });

  it("should point out answers that override the tiers, and drop them on request", async () => {
    // GIVEN a finished alphabetical sort where a1 beat f1, then fun made the top tier
    const page = await tiered("pairwise-tiers", "", `[["a1","",[],"",["art"]],["f1","",[],"",["fun"]]]`);
    await page.evaluate(async () => { await (window as any).s.setPriority(["fun", "art"]); });
    // WHEN it renders
    // THEN it says one answer overrides the tier order
    expect(await text(page, "pairwise-tiers >>> [part=overrides] span")).toBe("1 answer of yours overrides the tier order — yours win.");
    // WHEN Drop them is pressed
    await page.click("pairwise-tiers >>> [part=overrides] button");
    await finish(page);
    // THEN the answer is gone and the tiers decide
    expect(await page.evaluate(() => (window as any).s.list.log.length)).toBe(0);
    expect(await page.$eval("pairwise-tiers >>> [part=overrides]", (e) => (e as HTMLElement).hidden)).toBe(true);
    await close(page);
  });

  it("should count several overriding answers in the plural", async () => {
    // GIVEN two answers where art items beat fun items, then fun made the top tier
    const page = await tiered("pairwise-tiers", "", `[["a1","",[],"",["art"]],["f1","",[],"",["fun"]],["a2","",[],"",["art"]],["f2","",[],"",["fun"]]]`);
    await page.evaluate(async () => { await (window as any).s.setPriority(["fun", "art"]); });
    // WHEN it renders
    // THEN it counts them
    expect(await text(page, "pairwise-tiers >>> [part=overrides] span")).toMatch(/^\d answers of yours override the tier order — yours win\.$/);
    await close(page);
  });
});

describe("<pairwise-weights>", () => {
  it("should switch between strict order and weights, and weigh each tier", async () => {
    // GIVEN two tiers in strict order
    const page = await tiered("pairwise-weights", `await s.setPriority(["art", "fun"]);`);
    // THEN strict order is chosen, with no weight inputs
    expect(await page.$eval("pairwise-weights >>> [part=order]", (r) => (r as HTMLInputElement).checked)).toBe(true);
    expect(await page.$$eval("pairwise-weights >>> [part~=weight]", (e) => e.length)).toBe(0);
    expect(await text(page, "pairwise-weights >>> [part=note]")).toBe("A higher tier beats a lower one outright, whatever the items are.");
    // WHEN weights are chosen
    await page.click("pairwise-weights >>> [part=weights]");
    await finish(page);
    // THEN each tier gets a weight input, and the note explains the scoring
    expect(await page.evaluate(() => (window as any).s.list.combine)).toBe("weights");
    expect(await page.$$eval("pairwise-weights >>> [part~=weight]", (e) => e.map((i) => (i as HTMLInputElement).value))).toEqual(["1", "1"]);
    expect(await text(page, "pairwise-weights >>> [part=note]")).toStartWith("Every tier contributes in proportion to its weight");
    // WHEN fun's weight is set to 4, then art's to 0
    const inputs = await page.$$("pairwise-weights >>> [part~=weight]");
    await inputs[1]!.click({ count: 3 }); await inputs[1]!.type("4"); await inputs[1]!.press("Tab");
    await finish(page);
    const again = await page.$$("pairwise-weights >>> [part~=weight]");
    await again[0]!.click({ count: 3 }); await again[0]!.type("0"); await again[0]!.press("Tab");
    await finish(page);
    // THEN fun weighs 4, and a non-positive weight reads as 1
    expect(await weights(page)).toEqual([1, 4]);
    // WHEN strict order is chosen again
    await page.click("pairwise-weights >>> [part=order]");
    await finish(page);
    // THEN the ranking combines strictly
    expect(await page.evaluate(() => (window as any).s.list.combine)).toBe("order");
    await close(page);
  });

  it("should explain that weights need tiers", async () => {
    // GIVEN no tiers
    const page = await tiered("pairwise-weights");
    // WHEN it renders
    // THEN it says tiers come first
    expect(await text(page, "pairwise-weights >>> [part=note]")).toBe("Add tiers first — weights say how much each tier counts.");
    await close(page);
  });
});
