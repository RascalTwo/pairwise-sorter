// The documentation page runs the library it documents: the "how it asks" trace is recorded from the real
// sortIndices, the cost chart calls the real budgetFor, and the three live elements are the real components over one
// Sorter. What must not go wrong silently: a trace that does not end in the right order, a cost figure that is
// wrong, live elements that disagree with each other or with the answers given.
import { describe, it, expect } from "vitest";
import type { Page } from "puppeteer-core";
import { open, text, question, ranking, progress, nextQuestion, inside } from "./helpers.ts";

/** Drag the cost chart's size slider to `n`. */
const setSize = async (page: Page, n: number): Promise<void> => {
  await page.$eval(
    "input#costN",
    (e, v) => {
      e.value = v;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    },
    String(n),
  );
};
/** Click the "a" or "b" card's Choose button inside the comparison's shadow root. */
const choose = async (page: Page, side: string): Promise<void> => {
  await page.evaluate((s) => {
    const b = document
      .querySelector("pairwise-compare")!
      .shadowRoot!.querySelector(`[data-choose=${s}]`);
    if (b instanceof HTMLElement) b.click();
  }, side);
};

// Worked by hand: worst-case questions for binary insertion of n items is the sum over i = 1..n-1 of ceil(log2(i+1)).
//   n = 30: 1 + (2+2) + 4x3 + 8x4 + 14x5 = 119
//   n = 200: i=1:1 | i=2-3: 2+2 | i=4-7: 4x3 | i=8-15: 8x4 | i=16-31: 16x5 | i=32-63: 32x6 | i=64-127: 64x7 | i=128-199: 72x8
//          = 1 + 4 + 12 + 32 + 80 + 192 + 448 + 576 = 1345

describe("why it's cheap (the cost chart)", () => {
  it.concurrent("should say what every pair, binary insertion and one more item cost for the list size chosen", async () => {
    const page = await viz.given("the chart at its first size, 30 items", async () => {
      return await open();
    });

    await viz.when("the reader leaves the size where it is");

    await viz.then(
      "it says 435 pairs, at most 119 questions by binary insertion (27%), and 5 to add one item",
      async () => {
        expect(await text(page, "#costOut")).toBe(
          "n = 30: every pair 435 · binary insertion at most 119 (27%) · one more item 5",
        );
      },
    );

    await viz.when("the reader drags the size to 200", async () => {
      await setSize(page, 200);
    });

    await viz.then("it says 19,900 pairs, at most 1345 (7%), and 8 to add one item", async () => {
      expect(await text(page, "#costOut")).toBe(
        "n = 200: every pair 19,900 · binary insertion at most 1345 (7%) · one more item 8",
      );
    });

    await viz.when("they drag it to the smallest, 2", async () => {
      await setSize(page, 2);
    });

    await viz.then("one pair, one question, two to add one (never below 1)", async () => {
      expect(await text(page, "#costOut")).toBe(
        "n = 2: every pair 1 · binary insertion at most 1 (100%) · one more item 2",
      );
    });
  });

  it.concurrent("should draw one dot per line at the chosen size, moving with the slider", async () => {
    const { page, dotX } = await viz.given("the chart", async () => {
      const p = await open();
      const xs = async (): Promise<number[]> => {
        const found = await p.$$eval('#costSvg circle[data-viz-id^="dot-"]', (c) =>
          c.map((e) => +e.getAttribute("cx")!),
        );
        return found;
      };
      return { page: p, dotX: xs };
    });

    const before = await viz.when("the reader reads the dots at the first size", async () => {
      const xs = await dotX();
      return xs;
    });

    await viz.then("the three dots share one x (the same list size)", () => {
      expect(before).toHaveLength(3);
      expect(new Set(before).size).toBe(1);
    });

    const after = await viz.when("the size grows to 150", async () => {
      await setSize(page, 150);
      const xs = await dotX();
      return xs;
    });

    await viz.then("they all move right together", () => {
      expect(new Set(after).size).toBe(1);
      expect(after[0]!).toBeGreaterThan(before[0]!);
    });
  });
});

describe("how it asks (the recorded trace)", () => {
  it.concurrent("should walk eight coffees to the right ranking, asking only the questions it needs", async () => {
    const { page, total } = await viz.given("the walkthrough on its first step", async () => {
      const p = await open();
      expect(await text(p, "#howSay")).toBe(
        "Mocha goes first: with nothing ranked yet there is only 1 possible place.",
      );
      const at = await text(p, "#howAt");
      const steps = +/\/ (\d+)/u.exec(at)![1]!;
      expect(at).toMatch(/^step 1 \/ \d+$/u);
      return { page: p, total: steps };
    });

    const asked = await viz.when(
      "the reader presses Next to the very end, noting each question asked",
      async () => {
        const questions: string[] = [];
        for (let i = 1; i < total; i++) {
          // oxlint-disable-next-line no-await-in-loop -- each press must land before the next
          await page.click("#howNext");
          // oxlint-disable-next-line no-await-in-loop -- read the step each press produced
          const say = await text(page, "#howSay");
          if (/^Is .* better than .*\?/u.test(say)) questions.push(say);
        }
        return questions;
      },
    );

    await viz.then(
      "the last step says done, with as many questions as were asked, no more than the 17 worst case for 8 items, and fewer than the 28 pairs",
      async () => {
        expect(await text(page, "#howAt")).toBe(`step ${total} / ${total}`);
        const done = await text(page, "#howSay");
        expect(done).toBe(
          `Done: 8 items ranked with ${asked.length} questions. Asking about every pair would have taken 28.`,
        );
        expect(asked.length).toBeGreaterThanOrEqual(7);
        expect(asked.length).toBeLessThanOrEqual(17);
      },
    );

    await viz.then(
      "the coffees stand best to worst by the scores the page gives them (8 Flat white … 1 Drip)",
      async () => {
        const order = await page.$$eval("#howSvg g.node", (ns) =>
          ns
            .map((n) => ({
              name: n.querySelector("text")!.textContent,
              rank: n.querySelector(".rank")!.textContent,
              y: +/translate\([^,]+,\s*([\d.-]+)px/u.exec(n.style.transform)![1]!,
            }))
            .toSorted((a, b) => a.y - b.y),
        );
        expect(order.map((o) => o.name)).toEqual([
          "Flat white",
          "Cold brew",
          "Cortado",
          "Espresso",
          "Mocha",
          "Latte",
          "Americano",
          "Drip",
        ]);
        expect(order.map((o) => o.rank)).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"]);
      },
    );
  });

  it.concurrent("should step back and forward with the buttons and the arrow keys, and stop at both ends", async () => {
    const page = await viz.given("the walkthrough on step 1", async () => {
      return await open();
    });

    await viz.when("the reader presses Previous at the start", async () => {
      await page.click("#howPrev");
    });

    await viz.then("it stays on step 1", async () => {
      expect(await text(page, "#howAt")).toMatch(/^step 1 \//u);
    });

    await viz.when("they press Next", async () => {
      await page.click("#howNext");
    });

    await viz.then("it is on step 2", async () => {
      expect(await text(page, "#howAt")).toMatch(/^step 2 \//u);
    });

    await viz.when("they focus the figure and press the right arrow", async () => {
      await page.focus("#howFig");
      await page.keyboard.press("ArrowRight");
    });

    await viz.then("it is on step 3", async () => {
      expect(await text(page, "#howAt")).toMatch(/^step 3 \//u);
    });

    await viz.when("they press the left arrow twice", async () => {
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
    });

    await viz.then("they are back at 1", async () => {
      expect(await text(page, "#howAt")).toMatch(/^step 1 \//u);
    });
  });

  it.concurrent("should play on request and pause again, and record the step in the link", async () => {
    const page = await viz.given("the walkthrough", async () => {
      return await open();
    });

    await viz.when("the reader presses Play", async () => {
      await page.click("#howPlay");
    });

    await viz.then("it offers Pause", async () => {
      expect(await text(page, "#howPlay")).toBe("❚❚ Pause");
    });

    await viz.when("they press Pause", async () => {
      await page.click("#howPlay");
    });

    await viz.then("it offers Play again", async () => {
      expect(await text(page, "#howPlay")).toBe("▶ Play");
    });

    await viz.when("they step on twice", async () => {
      await page.click("#howNext");
      await page.click("#howNext");
    });

    await viz.then("the link records the step (so it can be shared)", async () => {
      expect(await page.evaluate(() => decodeURIComponent(location.hash))).toMatch(/how/u);
    });
  });

  it.concurrent("should ask whether the new item beats the middle of what is still open, and say where it ended up", async () => {
    const page = await viz.given(
      "the walkthrough stepped to the first question (Cold brew against Mocha)",
      async () => {
        const p = await open();
        await p.click("#howNext"); // place Mocha
        await p.click("#howNext"); // take Cold brew
        expect(await text(p, "#howSay")).toMatch(
          /^Next up: Cold brew\. With 1 already ranked it has 2 possible places — above or below Mocha\.$/u,
        );
        await p.click("#howNext"); // ask
        expect(await text(p, "#howSay")).toMatch(/^Is Cold brew better than Mocha\?/u);
        return p;
      },
    );

    await viz.when(
      "the answer arrives (the page answers by the coffees' scores: Cold brew 7 beats Mocha 4)",
      async () => {
        await page.click("#howNext");
      },
    );

    await viz.then("it says yes, and that one place is left: #1", async () => {
      expect(await text(page, "#howSay")).toBe(
        "Yes — Cold brew is better, so it goes above Mocha; that leaves 1 possible place: #1.",
      );
    });
  });
});

describe("what's in the box (the architecture browser)", () => {
  it.concurrent("should open the description of the box clicked or chosen with the keyboard, one at a time", async () => {
    const page = await viz.given("the browser, open on the Sorter", async () => {
      const p = await open();
      expect(await text(p, "#detail h3")).toBe("Sorter");
      expect(await p.$$eval("#archSvg .box.on", (b) => b.length)).toBe(1);
      return p;
    });

    await viz.when("the reader clicks the engine box", async () => {
      await page.click('#archSvg .box[data-id="engine"]');
    });

    await viz.then("its description shows, and only it is marked", async () => {
      expect(await text(page, "#detail h3")).toBe("engine");
      expect(await text(page, "#detail")).toContain(
        "The decision log, tiers and the binary-insertion sort.",
      );
      expect(await page.$$eval("#archSvg g.box.on", (b) => b.map((e) => e.dataset["id"]))).toEqual([
        "engine",
      ]);
    });

    await viz.when("they focus another box and press Enter", async () => {
      await page.$eval('#archSvg .box[data-id="tiers"]', (e) => {
        if (e instanceof SVGElement) e.focus();
      });
      await page.keyboard.press("Enter");
    });

    await viz.then("that one shows instead", async () => {
      expect(await text(page, "#detail h3")).toBe("<pairwise-tiers>");
      expect(await page.$$eval("#archSvg g.box.on", (b) => b.map((e) => e.dataset["id"]))).toEqual([
        "tiers",
      ]);
    });
  });
});

describe("three elements, one Sorter (the live demo)", () => {
  /** Answer by a fixed taste: the alphabetically earlier title always wins. */
  async function answerAlphabetically(page: Awaited<ReturnType<typeof open>>, until = 100) {
    let q = await question(page),
      n = 0;
    while (q && n++ < until) {
      const side = q.a < q.b ? "a" : "b";
      // oxlint-disable-next-line no-await-in-loop -- answers are given one at a time
      await choose(page, side);
      // oxlint-disable-next-line no-await-in-loop -- wait for the next question before answering it
      q = await nextQuestion(page, q);
    }
    return n;
  }

  it.concurrent("should ask a question straight away, with the progress counting nothing yet", async () => {
    const page = await viz.given("the live demo with six coffees", async () => {
      return await open();
    });

    await viz.when("the reader has not answered anything yet");

    await viz.then(
      "two of them are up for comparison, and progress has counted no answers against the worst case of 11",
      async () => {
        const q = (await question(page))!;
        expect(
          [q.a, q.b].every((t) =>
            ["Flat white", "Cold brew", "Mocha", "Cortado", "Espresso", "Chai"].includes(t),
          ),
        ).toBe(true);
        expect(q.a).not.toBe(q.b);
        expect(await progress(page)).toMatch(/^0 of ~11 comparisons · \d of 6 placed$/u);
      },
    );
  });

  it.concurrent("should rank the six coffees in the order the reader prefers, in every element, using no more than the budget", async () => {
    const page = await viz.given("the live demo", async () => {
      return await open();
    });

    const answers = await viz.when(
      "the reader always picks the alphabetically earlier title, until no question is left",
      async () => {
        const n = await answerAlphabetically(page);
        return n;
      },
    );

    await viz.then(
      "the comparison goes idle, and the ranking lists them alphabetically, ranked 1 to 6",
      async () => {
        expect(await question(page)).toBeNull();
        expect(await ranking(page)).toEqual([
          ["1", "Chai"],
          ["2", "Cold brew"],
          ["3", "Cortado"],
          ["4", "Espresso"],
          ["5", "Flat white"],
          ["6", "Mocha"],
        ]);
      },
    );

    await viz.then(
      "progress counts the answers given, against the worst case of 11, with everything placed",
      async () => {
        expect(answers).toBeGreaterThanOrEqual(5);
        expect(answers).toBeLessThanOrEqual(11);
        expect(await progress(page)).toBe(`${answers} of ~11 comparisons · 6 of 6 placed`);
      },
    );
  });

  it.concurrent("should rank the reverse when the reader prefers the later title, and start over on request", async () => {
    const page = await viz.given("the live demo", async () => {
      return await open();
    });

    await viz.when(
      "the reader always picks the later title, until no question is left",
      async () => {
        let q = await question(page);
        while (q) {
          const side = q.a > q.b ? "a" : "b";
          // oxlint-disable-next-line no-await-in-loop -- answers are given one at a time
          await choose(page, side);
          // oxlint-disable-next-line no-await-in-loop -- wait for the next question before answering it
          q = await nextQuestion(page, q);
        }
      },
    );

    await viz.then("the ranking is reverse-alphabetical", async () => {
      expect((await ranking(page)).map(([, t]) => t)).toEqual([
        "Mocha",
        "Flat white",
        "Espresso",
        "Cortado",
        "Cold brew",
        "Chai",
      ]);
    });

    await viz.when("they press Start over", async () => {
      await page.click("#liveReset");
    });

    await viz.then(
      "a question is waiting again and progress is back at nothing (the first coffee is placed for free)",
      async () => {
        expect(await question(page)).not.toBeNull();
        expect(await progress(page)).toMatch(/^0 of ~11 comparisons/u);
        expect(await ranking(page)).toEqual([["1", "Flat white"]]);
        expect(
          await inside(page, "pairwise-ranking", (r) =>
            [...r.querySelectorAll("[part=unplaced] li")].map((li) => li.textContent).toSorted(),
          ),
        ).toEqual(["Chai", "Cold brew", "Cortado", "Espresso", "Mocha"]);
      },
    );
  });

  it.concurrent("should answer with the arrow keys: left chooses the left card, and down says equal", async () => {
    const { page, q1 } = await viz.given("the live demo with a question up", async () => {
      const p = await open();
      const first = (await question(p))!;
      return { page: p, q1: first };
    });

    const q2 = await viz.when("the reader presses the left arrow", async () => {
      await page.keyboard.press("ArrowLeft");
      const next = (await nextQuestion(page, q1))!;
      return next;
    });

    await viz.then(
      "the answer counted (1 of ~11), and the next question is a different pair",
      async () => {
        expect(await progress(page)).toMatch(/^1 of ~11 comparisons/u);
      },
    );

    await viz.when('they press down for "equal"', async () => {
      await page.keyboard.press("ArrowDown");
      await nextQuestion(page, q2);
    });

    await viz.then("two answers are counted", async () => {
      expect(await progress(page)).toMatch(/^2 of ~11 comparisons/u);
    });
  });
});
