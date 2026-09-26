import { describe, expect, it } from "bun:test";
import type { Page } from "puppeteer-core";
import { close, open, text, texts } from "./harness.ts";

/** A page with <pairwise-compare> driving a sorter over `items` (JSON for pw.item args). */
const compare = (items: unknown[][], extra = "") => open(`<input id="elsewhere"><pairwise-compare></pairwise-compare>`, `
  const s = new pw.Sorter({ ...pw.emptyList("t"), items: ${JSON.stringify(items)}.map((a) => pw.item(...a)) });
  window.s = s;
  const el = document.querySelector("pairwise-compare");
  ${extra}
  el.sorter = s;
  await s.settled();
`);
const cards = (page: Page) => texts(page, "pairwise-compare >>> [part~=title]");
const logLength = (page: Page) => page.evaluate(() => (window as any).s.list.log.length as number);
const settle = (page: Page) => page.evaluate(() => (window as any).s.settled());

describe("<pairwise-compare>", () => {
  it("should show the two items being asked about and record the one chosen", async () => {
    // GIVEN a sorter over three items
    const page = await compare([["b"], ["a"], ["c"]]);
    // WHEN the first pair is shown
    // THEN both titles are on the cards
    expect((await cards(page)).sort()).toEqual(["a", "b"]);
    // WHEN the right-hand item is chosen
    const right = (await cards(page))[1];
    await page.click("pairwise-compare >>> [part~=choose-b]");
    await settle(page);
    // THEN one answer is recorded, saying the right item won
    expect(await logLength(page)).toBe(1);
    expect(await page.evaluate(() => (window as any).s.comparisons()[0].verdict)).toBeDefined();
    expect(await page.evaluate((t) => { const s = (window as any).s; return s.ranking()[0].item.title === t; }, right)).toBe(true);
    // WHEN the left item is chosen until the sort is done
    while (await page.evaluate(() => !!(window as any).s.question)) {
      await page.click("pairwise-compare >>> [part~=choose-a]");
      await settle(page);
    }
    // THEN the finished state says there is nothing to compare
    expect(await text(page, "pairwise-compare >>> [part=idle]")).toBe("Nothing to compare right now.");
    await close(page);
  });

  it("should answer from the keyboard, undo with Backspace, and leave keys alone while typing", async () => {
    // GIVEN a sorter over four items
    const page = await compare([["a"], ["b"], ["c"], ["d"]]);
    // WHEN ←, → and = are pressed
    await page.keyboard.press("ArrowLeft"); await settle(page);
    await page.keyboard.press("ArrowRight"); await settle(page);
    await page.keyboard.press("Equal"); await settle(page);
    // THEN three answers are recorded
    expect(await logLength(page)).toBe(3);
    // WHEN Backspace is pressed
    await page.keyboard.press("Backspace"); await settle(page);
    // THEN the last answer is undone
    expect(await logLength(page)).toBe(2);
    // WHEN ↓ is pressed while typing in an input elsewhere on the page
    await page.focus("#elsewhere");
    await page.keyboard.press("ArrowDown"); await settle(page);
    // THEN nothing is answered
    expect(await logLength(page)).toBe(2);
    // WHEN ↓ is pressed outside an input
    await page.$eval("#elsewhere", (el) => (el as HTMLElement).blur());
    await page.keyboard.press("ArrowDown"); await settle(page);
    // THEN it answers "equal"
    expect(await page.evaluate(() => (window as any).s.list.log.at(-1)[1])).toBe(0);
    await close(page);
  });

  it("should not answer from the keyboard when turned off, hidden, or given an unrelated key", async () => {
    // GIVEN a compare element with the keyboard turned off
    const page = await compare([["a"], ["b"]], `el.setAttribute("no-keyboard", "");`);
    // WHEN ← and an unrelated key are pressed
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("KeyX");
    // THEN nothing is answered
    expect(await logLength(page)).toBe(0);
    // WHEN the keyboard is turned on but the element is hidden
    await page.$eval("pairwise-compare", (el) => { el.removeAttribute("no-keyboard"); (el as HTMLElement).hidden = true; });
    await page.keyboard.press("ArrowLeft");
    // THEN nothing is answered either
    expect(await logLength(page)).toBe(0);
    await close(page);
  });

  it("should leave alone a key another handler on the page already took", async () => {
    // GIVEN a focusable widget elsewhere that handles arrow keys itself
    const page = await compare([["a"], ["b"]], `const w = document.createElement("div");
      w.tabIndex = 0; w.id = "widget"; document.body.prepend(w);
      w.addEventListener("keydown", (e) => e.preventDefault());`);
    // WHEN ← is pressed while it has focus
    await page.focus("#widget");
    await page.keyboard.press("ArrowLeft");
    // THEN nothing is answered
    expect(await logLength(page)).toBe(0);
    await close(page);
  });

  it("should stop listening to keys once removed from the page", async () => {
    // GIVEN a compare element that is then removed
    const page = await compare([["a"], ["b"]]);
    await page.$eval("pairwise-compare", (el) => el.remove());
    // WHEN ← is pressed
    await page.keyboard.press("ArrowLeft");
    // THEN nothing is answered
    expect(await logLength(page)).toBe(0);
    await close(page);
  });

  it("should not vote when a card's text is clicked", async () => {
    // GIVEN two items
    const page = await compare([["a", "", [], "some description"], ["b"]]);
    // WHEN a title and a description are clicked
    await page.click("pairwise-compare >>> [part~=title]");
    await page.click("pairwise-compare >>> [part~=desc]");
    // THEN nothing is answered
    expect(await logLength(page)).toBe(0);
    await close(page);
  });

  it("should answer 'equal' from the Equal button", async () => {
    // GIVEN two items
    const page = await compare([["a"], ["b"]]);
    // WHEN Equal is pressed
    await page.click("pairwise-compare >>> [part~=equal]");
    await settle(page);
    // THEN a tie is recorded
    expect(await page.evaluate(() => (window as any).s.list.log[0][1])).toBe(0);
    await close(page);
  });

  it("should show description, link, and tags numbered by their tier, escaping every field", async () => {
    // GIVEN an item with every field, including markup in its title, and a tiered tag
    const page = await compare([["<b>bold</b>", "https://ex.com/p", [], "a desc", ["top", "misc"]], ["plain", "", [], "", ["top"]]],
      `await s.setPriority(["top"]);`);
    // WHEN the cards render
    const titles = await cards(page);
    // THEN markup is shown as text
    expect(titles).toContain("<b>bold</b>");
    // THEN the description, link and numbered tier chip are shown on the full card
    const full = await page.$$eval("pairwise-compare >>> [part~=card]", (els) => els.map((e) => e.textContent!));
    const rich = full.find((t) => t.includes("a desc"))!;
    expect(await texts(page, "pairwise-compare >>> [part~=card] .tag")).toEqual(expect.arrayContaining(["1#top", "#misc"]));
    expect(rich).toContain("#misc");
    const links = await page.$$eval("pairwise-compare >>> [part~=open]", (els) => els.map((e) => [(e as HTMLAnchorElement).href, (e as HTMLElement).hidden]));
    expect(links).toContainEqual(["https://ex.com/p", false]);
    expect(links.filter(([, hidden]) => hidden)).toHaveLength(1);
    await close(page);
  });

  it("should play video and audio, and page through more than four images", async () => {
    // GIVEN one item with five images and one with a video and an audio clip
    const imgs = [1, 2, 3, 4, 5].map((n) => `/test/element/px.svg?${n}`);
    const page = await compare([["pics", "", imgs], ["av", "", ["/v.mp4", "/a.mp3"]]]);
    // WHEN the cards render
    // THEN the video and audio have controls
    expect(await page.$$eval("pairwise-compare >>> video[controls]", (e) => e.length)).toBe(1);
    expect(await page.$$eval("pairwise-compare >>> audio[controls]", (e) => e.length)).toBe(1);
    // THEN the image card shows its first four images and a page count
    expect(await page.$$eval("pairwise-compare >>> [part~=body] img", (e) => e.length)).toBe(4);
    expect(await text(page, "pairwise-compare >>> [part=pages] span")).toBe("1 / 2");
    // WHEN the next page is shown, then the previous from the first (wrapping)
    await page.click("pairwise-compare >>> [part=pages] [data-step='1']");
    const second = await page.$$eval("pairwise-compare >>> [part~=body] img", (e) => e.map((i) => (i as HTMLImageElement).src.split("?")[1]));
    await page.click("pairwise-compare >>> [part=pages] [data-step='-1']");
    await page.click("pairwise-compare >>> [part=pages] [data-step='-1']");
    // THEN it shows the fifth image, and wraps back round to it
    expect(second).toEqual(["5"]);
    expect(await text(page, "pairwise-compare >>> [part=pages] span")).toBe("2 / 2");
    await close(page);
  });

  it("should enlarge an image without voting, step through every image, and close", async () => {
    // GIVEN two cards with images
    const page = await compare([["x", "", ["/test/element/px.svg?1", "/test/element/px.svg?2"]], ["y", "", ["/test/element/px.svg?3"]]]);
    // WHEN an image is clicked
    await page.click("pairwise-compare >>> [part~=body] img");
    const lightbox = "pairwise-compare >>> [part=lightbox]";
    // THEN the lightbox opens with a count, and no answer is recorded
    expect(await page.$eval(lightbox, (e) => (e as HTMLElement).hidden)).toBe(false);
    expect(await text(page, "pairwise-compare >>> [part=lightbox] .count")).toMatch(/^\d \/ 3$/);
    // WHEN → and the ‹ button are used, then ← is pressed
    await page.keyboard.press("ArrowRight");
    const after = await text(page, "pairwise-compare >>> [part=lightbox] .count");
    await page.click("pairwise-compare >>> [part=lightbox] [data-step='-1']");
    await page.keyboard.press("ArrowLeft");
    // THEN it steps through images and none of those keys voted
    expect(after).toMatch(/^\d \/ 3$/);
    expect(await logLength(page)).toBe(0);
    // WHEN Escape is pressed
    await page.keyboard.press("Escape");
    // THEN it closes
    expect(await page.$eval(lightbox, (e) => (e as HTMLElement).hidden)).toBe(true);
    // WHEN it is reopened and closed with its button, then reopened and closed by clicking the backdrop
    await page.click("pairwise-compare >>> [part~=body] img");
    await page.keyboard.press("KeyQ");
    await page.click("pairwise-compare >>> [part=lightbox] .close");
    await page.click("pairwise-compare >>> [part~=body] img");
    await page.click("pairwise-compare >>> [part=lightbox] img");
    const stillOpen = await page.$eval(lightbox, (e) => (e as HTMLElement).hidden);
    await page.mouse.click(5, 5);
    // THEN clicking the image keeps it open, and the backdrop closes it
    expect(stillOpen).toBe(false);
    expect(await page.$eval(lightbox, (e) => (e as HTMLElement).hidden)).toBe(true);
    await close(page);
  });

  it("should show a single image without step buttons in the lightbox", async () => {
    // GIVEN only one image on screen
    const page = await compare([["x", "", ["/test/element/px.svg?9"]], ["y"]]);
    // WHEN it is enlarged
    await page.click("pairwise-compare >>> [part~=body] img");
    // THEN there is nothing to step to
    expect(await page.$$eval("pairwise-compare >>> [part=lightbox] [data-step]", (e) => e.filter((b) => !(b as HTMLElement).hidden).length)).toBe(0);
    await page.keyboard.press("ArrowRight");
    expect(await text(page, "pairwise-compare >>> [part=lightbox] .count")).toBe("");
    await close(page);
  });

  it("should bench an item from its card, and ask the host to edit one", async () => {
    // GIVEN three items
    const page = await compare([["a"], ["b"], ["c"]]);
    const edited = page.evaluate(() => new Promise((r) =>
      document.querySelector("pairwise-compare")!.addEventListener("pairwise-edit", (e) => r((e as CustomEvent).detail))));
    // WHEN edit is pressed on the left card
    await page.click("pairwise-compare >>> [part~=edit]");
    // THEN the host is told which item
    expect(await edited).toEqual({ index: expect.any(Number) });
    // WHEN bench is pressed on the left card
    const left = (await cards(page))[0];
    await page.click("pairwise-compare >>> [part~=bench]");
    await settle(page);
    // THEN that item is benched
    expect(await page.evaluate(() => (window as any).s.benchedItems().map((i: any) => i.title))).toEqual([left]);
    await close(page);
  });

  it("should let a host draw items its own way, and still enlarge an image it draws", async () => {
    // GIVEN a renderItem hook that draws a title and an avatar image the items do not list
    const page = await compare([["a"], ["b"]], `el.renderItem = (it, box) => {
      box.innerHTML = "<span>custom " + it.title + "</span><img src='/test/element/px.svg?avatar'>";
    };`);
    // WHEN the cards render
    const bodies = await texts(page, "pairwise-compare >>> [part~=body]");
    // THEN the hook drew them
    expect(bodies.sort()).toEqual(["custom a", "custom b"]);
    // WHEN the drawn image is clicked
    await page.click("pairwise-compare >>> [part~=body] img");
    // THEN the lightbox shows that image
    expect(await page.$eval("pairwise-compare >>> [part=lightbox] img", (i) => (i as HTMLImageElement).src)).toEndWith("?avatar");
    await close(page);
  });

  it("should preload the images of pairs that may be asked next", async () => {
    // GIVEN items whose images are only fetched once needed
    const page = await compare([], "");
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    // WHEN a sorter with image items starts, and a video item is among them
    await page.evaluate(async () => {
      const w = window as any;
      const items = ["a", "b", "c", "d"].map((t) => w.pw.item(t, "", [`/test/element/px.svg?pre-${t}`]))
        .concat([w.pw.item("v", "", ["/pre.mp4"])]);
      const s = new w.pw.Sorter({ ...w.pw.emptyList("p"), items });
      document.querySelector("pairwise-compare")!.sorter = s;
      await s.settled();
      w.s = s;
    });
    await new Promise((r) => setTimeout(r, 100));
    // WHEN a question is answered, so the same upcoming images are hinted again
    await page.evaluate(async () => { const s = (window as any).s; await s.answer(-1); });
    await new Promise((r) => setTimeout(r, 100));
    // THEN no image was fetched twice by preloading
    const pre = requested.filter((u) => u.includes("pre-"));
    expect(new Set(pre).size).toBe(pre.length);
    // THEN an image not yet on screen was fetched ahead of time, and the video was not
    const shown = await page.$$eval("pairwise-compare >>> [part~=body] img", (e) => e.map((i) => (i as HTMLImageElement).src));
    expect(requested.some((u) => u.includes("pre-") && !shown.includes(u))).toBe(true);
    expect(requested.some((u) => u.endsWith("/pre.mp4"))).toBe(false);
    await close(page);
  });
});
