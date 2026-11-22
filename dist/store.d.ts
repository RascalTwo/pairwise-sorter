import { type Combine, type LogEntry, type Verdict } from "./engine.ts";
import { type Item } from "./item.ts";
/** One ranked list, as stored. */
export interface List {
    name: string;
    items: Item[];
    log: LogEntry[];
    /** Ids out of the ranking. Their answers are kept, so subbing back in re-asks nothing. */
    benched: string[];
    /** Tier tags, best first. Empty = tiers off. */
    priority: string[];
    /** Parallel to `priority`; only read when `combine` is "weights". */
    weights: number[];
    combine: Combine;
}
/** Every list, and which one is open. */
export interface Library {
    version: number;
    current: string | null;
    lists: Record<string, List>;
}
export declare const emptyList: (name: string) => List;
export declare const emptyLibrary: () => Library;
/** The stored-data version this build writes. */
export declare const SCHEMA: number;
/**
 * Bring a library up to {@link SCHEMA} in place; returns the steps applied. Data from a NEWER
 * build is left untouched (0 steps) — running older migrations over it would corrupt it.
 */
export declare function migrate(db: Library): number;
/** The parts of `Storage` the adapter uses. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
/**
 * Keep a library in `localStorage` (or anything with getItem/setItem). The default key is the
 * one the original pairwise-sorter page used, so its data loads straight in.
 */
export declare function localStore(key?: string, storage?: StorageLike): {
    load(): Library;
    save(lib: Library): void;
};
/** Add an empty list, make it current, and return its id. */
export declare function addList(lib: Library, name?: string): string;
/** A list by id or by name. Names are not unique, so an ambiguous name is an error. */
export declare function resolveList(lib: Library, ref: string): string;
/** Delete a list; if it was current, the first remaining list (or none) becomes current. */
export declare function deleteList(lib: Library, id: string): void;
/** How an export names an item: its identity fields. */
export type ItemRef = {
    title: string;
    url: string;
    key?: string;
};
/** The interchange format: readable `{a, b, verdict}` pairs rather than internal keys. */
export interface ExportPayload {
    format: "pairwise-sorter/3";
    name: string;
    items: Item[];
    priority: string[];
    weights: number[];
    combine: Combine;
    benched: ItemRef[];
    /** `implied` marks an answer filled in from an earlier order, not given (see `Sorter.retire`). */
    comparisons: {
        a: ItemRef;
        b: ItemRef;
        verdict: Verdict;
        implied?: true;
    }[];
    /** Titles best first — a convenience for humans, ignored on import. */
    ranking: string[];
}
/** A list as a hand-editable export. */
export declare function exportList(list: List, ranking?: string[]): ExportPayload;
/**
 * Build a list from an export — any of formats /1, /2, /3, or a bare array of items.
 * Answers about items not in the list are skipped and counted.
 */
export declare function importList(data: unknown): {
    list: List;
    count: number;
    kept: number;
    skipped: number;
};
