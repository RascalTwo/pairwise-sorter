import { describe, expect, it } from "bun:test";
import {
  budgetFor, disagreements, flipOfIds, idOf, item, minimiseDisagreements, pairKeyOf, placement, preferences,
  rankRows, roc, STOP_AT, tieredBudget, tierOverrides, weightedOrder, type LogEntry, type Verdict,
} from "../src/index.ts";

const said = (a: string, b: string, v: Verdict): LogEntry => [pairKeyOf(a, b), (v * flipOfIds(a, b)) as Verdict];
const titles = (items: { title: string }[], order: number[]) => order.map((i) => items[i]!.title);

describe("roc", () => {
  it("should give rank-order-centroid weights that sum to one and fall with rank", () => {
    // GIVEN three ranks
    const w = [1, 2, 3].map((r) => roc(r, 3));
    // WHEN they are summed and compared
    // THEN they sum to 1
    expect(w.reduce((a, b) => a + b)).toBeCloseTo(1);
    // THEN each is smaller than the one above it
    expect(w[0]! > w[1]! && w[1]! > w[2]!).toBe(true);
  });
});

describe("weightedOrder", () => {
  // Strict tiers put every "art" item above every "fun" item. Weights let fun's best item,
  // which you care about ten times more, climb over art's worst.
  const items = [
    item("art1", "", [], "", ["art"]), item("art2", "", [], "", ["art"]), item("art3", "", [], "", ["art"]),
    item("fun1", "", [], "", ["fun"]), item("none"),
  ];
  const base = [0, 1, 2, 3, 4];

  it("should return the sort's order untouched in strict mode or without tiers", () => {
    // GIVEN tiers in strict order mode, and no tiers at all
    // WHEN combined
    // THEN nothing moves
    expect(weightedOrder(base, items, ["art", "fun"], [1, 10], "order")).toEqual(base);
    expect(weightedOrder(base, items, [], [], "weights")).toEqual(base);
  });

  it("should let a heavily weighted lower tier outrank a higher tier, keeping untiered items last", () => {
    // GIVEN fun weighted ten times art
    // WHEN combined by weight
    const out = weightedOrder(base, items, ["art", "fun"], [1, 10], "weights");
    // THEN fun1 leads
    expect(titles(items, out)[0]).toBe("fun1");
    // THEN the art items keep their sorted order behind it
    expect(titles(items, out).slice(1, 4)).toEqual(["art1", "art2", "art3"]);
    // THEN the untiered item stays at the bottom
    expect(titles(items, out).at(-1)).toBe("none");
  });

  it("should treat a missing or non-positive weight as 1", () => {
    // GIVEN two single-item tiers whose weights are invalid
    const two = [item("a", "", [], "", ["x"]), item("b", "", [], "", ["y"])];
    // WHEN combined by weight
    // THEN both score equally and the sort's order breaks the tie
    expect(weightedOrder([1, 0], two, ["x", "y"], [0, Number.NaN], "weights")).toEqual([1, 0]);
  });
});

describe("resolving conflicts", () => {
  const items = ["a", "b", "c", "d"].map((t) => item(t));
  const [a, b, c, d] = items.map(idOf) as [string, string, string, string];

  it("should reorder to contradict fewer answers, ignoring ties", () => {
    // GIVEN answers that say d beats everyone, and a tie that must not count
    const log = [said(d, a, -1), said(d, b, -1), said(d, c, -1), said(a, b, -1), said(b, c, 0)];
    const pref = preferences(log);
    // WHEN an order with d last is improved
    const before = disagreements([0, 1, 2, 3], items, pref);
    const next = minimiseDisagreements([0, 1, 2, 3], items, pref);
    // THEN it contradicted three answers
    expect(before).toBe(3);
    // THEN the new order contradicts none, with d first
    expect(disagreements(next, items, pref)).toBe(0);
    expect(titles(items, next)[0]).toBe("d");
  });

  it("should stop when a pass finds nothing to gain, even in a genuine cycle", () => {
    // GIVEN a three-way cycle
    const log = [said(a, b, -1), said(b, c, -1), said(c, a, -1)];
    const pref = preferences(log);
    // WHEN minimised
    const next = minimiseDisagreements([0, 1, 2], items, pref);
    // THEN one answer is still contradicted, since no order satisfies all three
    expect(disagreements(next, items, pref)).toBe(1);
  });

  it("should count repeated answers as extra weight", () => {
    // GIVEN the same preference given twice
    const pref = preferences([said(b, a, -1), said(b, a, -1)]);
    // WHEN a is placed above b
    // THEN both answers count against it
    expect(disagreements([0, 1], items, pref)).toBe(2);
  });
});

describe("tierOverrides", () => {
  it("should list the answers that go against the tier order", () => {
    // GIVEN top > bottom tiers, with untiered items in the band below both
    // GIVEN answers agreeing and disagreeing, one of them about an item that is gone
    const items = [item("t", "", [], "", ["top"]), item("b", "", [], "", ["bottom"]), item("u")];
    const [t, b, u] = items.map(idOf) as [string, string, string];
    const log = [said(t, b, -1), said(b, t, -1), said(t, u, 1), said(t, "gone", 1)];
    // WHEN overrides are found
    // THEN the answers against the tiers are listed, including untiered-beats-tiered
    expect(tierOverrides(items, log, ["top", "bottom"])).toEqual([1, 2]);
    // THEN there are none with tiers off
    expect(tierOverrides(items, log, [])).toEqual([]);
  });
});

describe("tieredBudget", () => {
  it("should sum each tier's worst case, since cross-tier pairs are free", () => {
    // GIVEN three items in one tier and two in another
    const items = [..."abc"].map((t) => item(t, "", [], "", ["x"])).concat([..."de"].map((t) => item(t, "", [], "", ["y"])));
    const live = [0, 1, 2, 3, 4];
    // WHEN the budget is estimated with and without tiers
    // THEN tiers split it per tier
    expect(tieredBudget(items, live, ["x", "y"])).toBe(budgetFor(3) + budgetFor(2));
    // THEN without tiers it is the whole list's worst case
    expect(tieredBudget(items, live, [])).toBe(budgetFor(5));
  });
});

describe("placement", () => {
  it("should report how much of the list is placed, and when stopping stops being premature", () => {
    // GIVEN a sort with 3 of 4 placed, and one that has not started
    // WHEN placement is read
    // THEN it counts placed items
    expect(placement({ placed: [0, 1, 2], remaining: [3] })).toEqual({ placed: 3, total: 4, pct: 75 });
    // THEN an empty sort reads as complete
    expect(placement({ placed: [], remaining: [] }).pct).toBe(100);
    expect(STOP_AT).toBe(50);
  });
});

describe("rankRows", () => {
  it("should give tied items one shared rank and number the next item by position", () => {
    // GIVEN a = b and c below them
    const items = ["a", "b", "c"].map((t) => item(t));
    const [a, b] = items.map(idOf) as [string, string];
    // WHEN rows are ranked
    const { rows, rankById } = rankRows([0, 1, 2], items, [said(a, b, 0)]);
    // THEN a and b share rank 1 and c is 3rd
    expect(rows.map((r) => [r.index, r.rank, r.tied])).toEqual([[0, 1, false], [1, 1, true], [2, 3, false]]);
    expect(rankById.get(idOf(items[2]))).toBe(3);
  });
});
