// Everything here READS the log and derives something to show. None of it picks the next
// question — that stays with the sort, which already never spends a comparison on a pair
// transitivity has settled (Maystre & Grossglauser, ICML 2017).

import { budgetFor, tieClasses, tierOf, tierVerdict, type Combine, type LogEntry } from "./engine.ts";
import { idOf, SEP, type Item } from "./item.ts";

/**
 * Rank-Order Centroid (Barron & Barrett 1996): the weight vector that minimises worst-case
 * error when ORDER is all you know. 1/n, 2/n… would claim every gap is the same size.
 */
export function roc(rank: number, n: number): number {
  let s = 0;
  for (let i = rank; i <= n; i++) s += 1 / i;
  return s / n;
}

/**
 * Re-rank by weighted score: the SUM of (tier weight × ROC position within that tier). A
 * weighted mean would cancel the weight out for every single-tag item. Untiered items keep
 * the bottom band: the tool never asserts a position you did not.
 */
export function weightedOrder(
  base: readonly number[], items: readonly Item[], priority: readonly string[], weights: readonly number[], combine: Combine,
): number[] {
  if (!priority.length || combine !== "weights") return [...base];
  const within = new Map(priority.map((t): [string, number[]] => [t, []]));
  for (const idx of base) for (const t of items[idx]!.tags) within.get(t)?.push(idx);

  const local = new Map<string, number>();
  for (const [t, list] of within) list.forEach((idx, i) => local.set(t + SEP + idx, roc(i + 1, list.length)));
  const weightOf = (t: string) => {
    const w = weights[priority.indexOf(t)] ?? 1;
    return w > 0 ? w : 1;
  };

  const scored: [number, number][] = [], untiered: number[] = [];
  for (const idx of base) {
    const tags = items[idx]!.tags.filter((t) => within.has(t));
    if (!tags.length) { untiered.push(idx); continue; }
    scored.push([idx, tags.reduce((s, t) => s + weightOf(t) * local.get(t + SEP + idx)!, 0)]);
  }
  // Stable within equal scores, so the sort's order still breaks every tie.
  return scored.map((e, i) => [...e, i]).sort((a, b) => b[1]! - a[1]! || a[2]! - b[2]!).map((e) => e[0]!).concat(untiered);
}

/** "winnerId SEP loserId" → how many times you said so. Ties never count. */
export function preferences(log: readonly LogEntry[]): Map<string, number> {
  const pref = new Map<string, number>();
  for (const [k, v] of log) {
    if (v === 0) continue;
    const [x, y] = k.split(SEP);
    const key = v < 0 ? x + SEP + y : y + SEP + x;
    pref.set(key, (pref.get(key) ?? 0) + 1);
  }
  return pref;
}

const beats = (pref: ReadonlyMap<string, number>, items: readonly Item[], a: number, b: number) =>
  pref.get(idOf(items[a]) + SEP + idOf(items[b])) ?? 0;

/** Total weight of answers this order contradicts. */
export function disagreements(order: readonly number[], items: readonly Item[], pref: ReadonlyMap<string, number>): number {
  let total = 0;
  for (let i = 0; i < order.length; i++)
    for (let j = i + 1; j < order.length; j++) total += beats(pref, items, order[j]!, order[i]!);
  return total;
}

/**
 * The order contradicting as few answers as this search can find. Minimum feedback arc set
 * is NP-hard, so this is vertex-relocation local search seeded from `order` — best effort,
 * not a proof of the minimum.
 */
export function minimiseDisagreements(
  order: readonly number[], items: readonly Item[], pref: ReadonlyMap<string, number>, maxPasses = 25,
): number[] {
  let cur = [...order];
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < cur.length; i++) {
      const v = cur[i]!;
      const rest = cur.slice(0, i).concat(cur.slice(i + 1));
      // Carry the running cost so one item's sweep is O(n), not O(n²).
      let cost = rest.reduce((s, r) => s + beats(pref, items, r, v), 0);
      let best = 0, bestCost = cost, stay = cost;
      for (let at = 1; at <= rest.length; at++) {
        const r = rest[at - 1]!;
        cost += beats(pref, items, v, r) - beats(pref, items, r, v);
        if (at === i) stay = cost;
        if (cost < bestCost) { bestCost = cost; best = at; }
      }
      // Only move for a strict gain — an unconstrained item must not drift to the top.
      if (stay === bestCost) best = i;
      rest.splice(best, 0, v);
      if (best !== i) moved = true;
      cur = rest;
    }
    if (!moved) break;
  }
  return cur;
}

/** Log indices of your answers that the tier order would have decided the other way. Yours win. */
export function tierOverrides(items: readonly Item[], log: readonly LogEntry[], priority: readonly string[]): number[] {
  if (!priority.length) return [];
  const byId = new Map(items.map((it) => [idOf(it), it]));
  return log.flatMap(([k, v], n) => {
    const [x = "", y = ""] = k.split(SEP);
    const a = byId.get(x), b = byId.get(y);
    if (!a || !b) return [];
    const t = tierVerdict(a, b, priority);
    return t !== null && t !== v ? [n] : [];
  });
}

/** Worst-case questions left to ask. With tiers, cross-tier pairs are free, so it is per tier. */
export function tieredBudget(items: readonly Item[], live: readonly number[], priority: readonly string[]): number {
  if (!priority.length) return budgetFor(live.length);
  const perTier = new Map<number, number>();
  for (const i of live) {
    const t = tierOf(items[i], priority);
    perTier.set(t, (perTier.get(t) ?? 0) + 1);
  }
  return [...perTier.values()].reduce((sum, n) => sum + budgetFor(n), 0);
}

/** % placed at which offering to stop stops being premature. */
export const STOP_AT = 50;

/**
 * How much of the ranking is already final. Binary insertion only ever ADDS to the placed set,
 * so placed items are in their final order: stopping early costs the unplaced ones, nothing else.
 */
export function placement(partial: { placed: readonly number[]; remaining: readonly number[] }) {
  const placed = partial.placed.length, total = placed + partial.remaining.length;
  return { placed, total, pct: total ? Math.round((placed / total) * 100) : 100 };
}

export interface RankRow { index: number; rank: number; tied: boolean }

/** Positions with shared ranks: an item joined to the one above by a chain of "equal" answers ties it. */
export function rankRows(order: readonly number[], items: readonly Item[], log: readonly LogEntry[]) {
  const cls = tieClasses(items, log);
  const rankById = new Map<string, number>();
  let rank = 0;
  const rows = order.map((index, pos): RankRow => {
    const tied = pos > 0 && cls(idOf(items[order[pos - 1]!])) === cls(idOf(items[index]));
    if (!tied) rank = pos + 1;
    rankById.set(idOf(items[index]), rank);
    return { index, rank, tied };
  });
  return { rows, rankById };
}
