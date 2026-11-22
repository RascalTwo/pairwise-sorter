import { type Combine, type LogEntry } from "./engine.ts";
import { type Item } from "./item.ts";
/**
 * Rank-Order Centroid (Barron & Barrett 1996): the weight vector that minimises worst-case
 * error when ORDER is all you know. 1/n, 2/n… would claim every gap is the same size.
 */
export declare function roc(rank: number, n: number): number;
/**
 * Re-rank by weighted score: the SUM of (tier weight × ROC position within that tier). A
 * weighted mean would cancel the weight out for every single-tag item. Untiered items keep
 * the bottom band: the tool never asserts a position you did not.
 */
export declare function weightedOrder(base: readonly number[], items: readonly Item[], priority: readonly string[], weights: readonly number[], combine: Combine): number[];
/** "winnerId SEP loserId" → how many times you said so. Ties never count. */
export declare function preferences(log: readonly LogEntry[]): Map<string, number>;
/** Total weight of answers this order contradicts. */
export declare function disagreements(order: readonly number[], items: readonly Item[], pref: ReadonlyMap<string, number>): number;
/**
 * The order contradicting as few answers as this search can find. Minimum feedback arc set
 * is NP-hard, so this is vertex-relocation local search seeded from `order` — best effort,
 * not a proof of the minimum.
 */
export declare function minimiseDisagreements(order: readonly number[], items: readonly Item[], pref: ReadonlyMap<string, number>, maxPasses?: number): number[];
/** Log indices of your answers that the tier order would have decided the other way. Yours win. */
export declare function tierOverrides(items: readonly Item[], log: readonly LogEntry[], priority: readonly string[]): number[];
/** Worst-case questions left to ask. With tiers, cross-tier pairs are free, so it is per tier. */
export declare function tieredBudget(items: readonly Item[], live: readonly number[], priority: readonly string[]): number;
/** % placed at which offering to stop stops being premature. */
export declare const STOP_AT = 50;
/**
 * How much of the ranking is already final. Binary insertion only ever ADDS to the placed set,
 * so placed items are in their final order: stopping early costs the unplaced ones, nothing else.
 */
export declare function placement(partial: {
    placed: readonly number[];
    remaining: readonly number[];
}): {
    placed: number;
    total: number;
    pct: number;
};
export interface RankRow {
    index: number;
    rank: number;
    tied: boolean;
}
/** Positions with shared ranks: an item joined to the one above by a chain of "equal" answers ties it. */
export declare function rankRows(order: readonly number[], items: readonly Item[], log: readonly LogEntry[]): {
    rows: RankRow[];
    rankById: Map<string, number>;
};
