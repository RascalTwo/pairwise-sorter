// The documentation page runs the library it documents: the "how it asks" trace is recorded from the real
// sortIndices, the cost chart calls the real budgetFor, and the three live elements are the real components over one
// Sorter. What must not go wrong silently: a trace that does not end in the right order, a cost figure that is
// wrong, live elements that disagree with each other or with the answers given.
import { describe, it, expect } from "bun:test";
import { open, text, question, ranking, progress, nextQuestion, inside } from "./helpers.ts";

// Worked by hand: worst-case questions for binary insertion of n items is the sum over i = 1..n-1 of ceil(log2(i+1)).
//   n = 30: 1 + (2+2) + 4x3 + 8x4 + 14x5 = 119
//   n = 200: i=1:1 | i=2-3: 2+2 | i=4-7: 4x3 | i=8-15: 8x4 | i=16-31: 16x5 | i=32-63: 32x6 | i=64-127: 64x7 | i=128-199: 72x8
//          = 1 + 4 + 12 + 32 + 80 + 192 + 448 + 576 = 1345

describe("why it's cheap (the cost chart)", () => {
  it.concurrent("should say what every pair, binary insertion and one more item cost for the list size chosen", async () => {
    // GIVEN the chart at its first size, 30 items
    const page = await open();

    // THEN it says 435 pairs, at most 119 questions by binary insertion (27%), and 5 to add one item
    expect(await text(page, "#costOut")).toBe("n = 30: every pair 435 · binary insertion at most 119 (27%) · one more item 5");

    // WHEN the reader drags the size to 200
    await page.$eval("#costN", (e) => { (e as HTMLInputElement).value = "200"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    // THEN it says 19,900 pairs, at most 1345 (7%), and 8 to add one item
    expect(await text(page, "#costOut")).toBe("n = 200: every pair 19,900 · binary insertion at most 1345 (7%) · one more item 8");

    // WHEN they drag it to the smallest, 2
    await page.$eval("#costN", (e) => { (e as HTMLInputElement).value = "2"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    // THEN one pair, one question, two to add one (never below 1)
    expect(await text(page, "#costOut")).toBe("n = 2: every pair 1 · binary insertion at most 1 (100%) · one more item 2");
  });

  it.concurrent("should draw one dot per line at the chosen size, moving with the slider", async () => {
    // GIVEN the chart
    const page = await open();
    const dotX = () => page.$$eval('#costSvg circle[data-viz-id^="dot-"]', (c) => c.map((e) => +e.getAttribute("cx")!));
    const before = await dotX();
    expect(before).toHaveLength(3);
    // THEN the three dots share one x (the same list size)
    expect(new Set(before).size).toBe(1);
    // WHEN the size grows THEN they all move right together
    await page.$eval("#costN", (e) => { (e as HTMLInputElement).value = "150"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    const after = await dotX();
    expect(new Set(after).size).toBe(1);
    expect(after[0]!).toBeGreaterThan(before[0]!);
  });
});

describe("how it asks (the recorded trace)", () => {
  it.concurrent("should walk eight coffees to the right ranking, asking only the questions it needs", async () => {
    // GIVEN the walkthrough on its first step
    const page = await open();
    expect(await text(page, "#howSay")).toBe("Mocha goes first: with nothing ranked yet there is only 1 possible place.");
    const at = await text(page, "#howAt");
    const total = +/\/ (\d+)/.exec(at)![1]!;
    expect(at).toMatch(/^step 1 \/ \d+$/);

    // WHEN the reader presses Next to the very end, noting each question asked
    const asked: string[] = [];
    for (let i = 1; i < total; i++) {
      await page.click("#howNext");
      const say = await text(page, "#howSay");
      if (/^Is .* better than .*\?/.test(say)) asked.push(say);
    }

    // THEN the last step says done, with as many questions as were asked, no more than the 17 worst case for 8 items, and fewer than the 28 pairs
    expect(await text(page, "#howAt")).toBe(`step ${total} / ${total}`);
    const done = await text(page, "#howSay");
    expect(done).toBe(`Done: 8 items ranked with ${asked.length} questions. Asking about every pair would have taken 28.`);
    expect(asked.length).toBeGreaterThanOrEqual(7);
    expect(asked.length).toBeLessThanOrEqual(17);

    // THEN the coffees stand best to worst by the scores the page gives them (8 Flat white … 1 Drip)
    const order = await page.$$eval("#howSvg .node", (ns) => ns.map((n) => ({ name: n.querySelector("text")!.textContent!, rank: n.querySelector(".rank")!.textContent!, y: +/translate\([^,]+,\s*([\d.-]+)px/.exec((n as SVGGElement).style.transform)![1]! })).sort((a, b) => a.y - b.y));
    expect(order.map((o) => o.name)).toEqual(["Flat white", "Cold brew", "Cortado", "Espresso", "Mocha", "Latte", "Americano", "Drip"]);
    expect(order.map((o) => o.rank)).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"]);
  });

  it.concurrent("should step back and forward with the buttons and the arrow keys, and stop at both ends", async () => {
    // GIVEN the walkthrough on step 1
    const page = await open();
    // WHEN the reader presses Previous at the start THEN it stays
    await page.click("#howPrev");
    expect(await text(page, "#howAt")).toMatch(/^step 1 \//);
    // WHEN they press Next, then focus the figure and use the arrows
    await page.click("#howNext");
    expect(await text(page, "#howAt")).toMatch(/^step 2 \//);
    await page.focus("#howFig");
    await page.keyboard.press("ArrowRight");
    expect(await text(page, "#howAt")).toMatch(/^step 3 \//);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    // THEN they are back at 1
    expect(await text(page, "#howAt")).toMatch(/^step 1 \//);
  });

  it.concurrent("should play on request and pause again, and record the step in the link", async () => {
    // GIVEN the walkthrough
    const page = await open();
    // WHEN the reader presses Play
    await page.click("#howPlay");
    // THEN it offers Pause
    expect(await text(page, "#howPlay")).toBe("❚❚ Pause");
    // WHEN they press Pause THEN it offers Play again
    await page.click("#howPlay");
    expect(await text(page, "#howPlay")).toBe("▶ Play");

    // WHEN they step on, the link records the step (so it can be shared)
    await page.click("#howNext");
    await page.click("#howNext");
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toMatch(/how/);
  });

  it.concurrent("should ask whether the new item beats the middle of what is still open, and say where it ended up", async () => {
    // GIVEN the walkthrough stepped to the first question (Cold brew against Mocha)
    const page = await open();
    await page.click("#howNext"); // place Mocha
    await page.click("#howNext"); // take Cold brew
    expect(await text(page, "#howSay")).toMatch(/^Next up: Cold brew\. With 1 already ranked it has 2 possible places — above or below Mocha\.$/);
    await page.click("#howNext"); // ask
    expect(await text(page, "#howSay")).toMatch(/^Is Cold brew better than Mocha\?/);
    // WHEN the answer arrives (the page answers by the coffees' scores: Cold brew 7 beats Mocha 4)
    await page.click("#howNext");
    // THEN it says yes, and that one place is left: #1
    expect(await text(page, "#howSay")).toBe("Yes — Cold brew is better, so it goes above Mocha; that leaves 1 possible place: #1.");
  });
});

describe("what's in the box (the architecture browser)", () => {
  it.concurrent("should open the description of the box clicked or chosen with the keyboard, one at a time", async () => {
    // GIVEN the browser, open on the Sorter
    const page = await open();
    expect(await text(page, "#detail h3")).toBe("Sorter");
    expect(await page.$$eval("#archSvg .box.on", (b) => b.length)).toBe(1);

    // WHEN the reader clicks the engine box
    await page.click('#archSvg .box[data-id="engine"]');
    // THEN its description shows, and only it is marked
    expect(await text(page, "#detail h3")).toBe("engine");
    expect(await text(page, "#detail")).toContain("The decision log, tiers and the binary-insertion sort.");
    expect(await page.$$eval("#archSvg .box.on", (b) => b.map((e) => (e as SVGGElement).dataset["id"]))).toEqual(["engine"]);

    // WHEN they focus another box and press Enter
    await page.$eval('#archSvg .box[data-id="tiers"]', (e) => (e as unknown as HTMLElement).focus());
    await page.keyboard.press("Enter");
    // THEN that one shows instead
    expect(await text(page, "#detail h3")).toBe("<pairwise-tiers>");
    expect(await page.$$eval("#archSvg .box.on", (b) => b.map((e) => (e as SVGGElement).dataset["id"]))).toEqual(["tiers"]);
  });
});

describe("three elements, one Sorter (the live demo)", () => {
  /** Answer by a fixed taste: the alphabetically earlier title always wins. */
  async function answerAlphabetically(page: Awaited<ReturnType<typeof open>>, until = 100) {
    let q = await question(page), n = 0;
    while (q && n++ < until) {
      const side = q.a < q.b ? "a" : "b";
      await page.evaluate((s) => (document.querySelector("pairwise-compare")!.shadowRoot!.querySelector(`[data-choose=${s}]`) as HTMLElement).click(), side);
      q = await nextQuestion(page, q);
    }
    return n;
  }

  it.concurrent("should ask a question straight away, with the progress counting nothing yet", async () => {
    // GIVEN the live demo with six coffees
    const page = await open();
    // THEN two of them are up for comparison, and progress has counted no answers against the worst case of 11
    const q = (await question(page))!;
    expect([q.a, q.b].every((t) => ["Flat white", "Cold brew", "Mocha", "Cortado", "Espresso", "Chai"].includes(t))).toBe(true);
    expect(q.a).not.toBe(q.b);
    expect(await progress(page)).toMatch(/^0 of ~11 comparisons · \d of 6 placed$/);
  });

  it.concurrent("should rank the six coffees in the order the reader prefers, in every element, using no more than the budget", async () => {
    // GIVEN the live demo
    const page = await open();

    // WHEN the reader always picks the alphabetically earlier title, until no question is left
    const answers = await answerAlphabetically(page);

    // THEN the comparison goes idle, and the ranking lists them alphabetically, ranked 1 to 6
    expect(await question(page)).toBeNull();
    expect(await ranking(page)).toEqual([["1", "Chai"], ["2", "Cold brew"], ["3", "Cortado"], ["4", "Espresso"], ["5", "Flat white"], ["6", "Mocha"]]);
    // THEN progress counts the answers given, against the worst case of 11, with everything placed
    expect(answers).toBeGreaterThanOrEqual(5);
    expect(answers).toBeLessThanOrEqual(11);
    expect(await progress(page)).toBe(`${answers} of ~11 comparisons · 6 of 6 placed`);
  });

  it.concurrent("should rank the reverse when the reader prefers the later title, and start over on request", async () => {
    // GIVEN the live demo, answered by the opposite taste
    const page = await open();
    let q = await question(page);
    while (q) {
      const side = q.a > q.b ? "a" : "b";
      await page.evaluate((s) => (document.querySelector("pairwise-compare")!.shadowRoot!.querySelector(`[data-choose=${s}]`) as HTMLElement).click(), side);
      q = await nextQuestion(page, q);
    }
    // THEN the ranking is reverse-alphabetical
    expect((await ranking(page)).map(([, t]) => t)).toEqual(["Mocha", "Flat white", "Espresso", "Cortado", "Cold brew", "Chai"]);

    // WHEN they press Start over
    await page.click("#liveReset");
    // THEN a question is waiting again and progress is back at nothing (the first coffee is placed for free)
    expect(await question(page)).not.toBeNull();
    expect(await progress(page)).toMatch(/^0 of ~11 comparisons/);
    expect(await ranking(page)).toEqual([["1", "Flat white"]]);
    expect(await inside(page, "pairwise-ranking", (r) => [...r.querySelectorAll("[part=unplaced] li")].map((li) => li.textContent).sort())).toEqual(["Chai", "Cold brew", "Cortado", "Espresso", "Mocha"]);
  });

  it.concurrent("should answer with the arrow keys: left chooses the left card, and down says equal", async () => {
    // GIVEN the live demo with a question up
    const page = await open();
    const q1 = (await question(page))!;

    // WHEN the reader presses the left arrow
    await page.keyboard.press("ArrowLeft");
    // THEN the answer counted (1 of ~11), and the next question is a different pair
    const q2 = (await nextQuestion(page, q1))!;
    expect(await progress(page)).toMatch(/^1 of ~11 comparisons/);

    // WHEN they press down for "equal"
    await page.keyboard.press("ArrowDown");
    await nextQuestion(page, q2);
    // THEN two answers are counted
    expect(await progress(page)).toMatch(/^2 of ~11 comparisons/);
  });
});
