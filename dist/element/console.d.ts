import type { Verdict } from "../engine.ts";
import { type Item } from "../item.ts";
import type { Tier } from "../sorter.ts";
import type { PairwiseSorter, Screen } from "./app.ts";
/** Put the console API for a `<pairwise-sorter>` on `window[name]` and return it. */
export declare function installConsole(el: PairwiseSorter, name?: string): {
    version: string;
    help: () => string;
    state: () => {
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    };
    ranking: () => {
        title: string;
        url: string;
        media: string[];
        desc: string;
        tags: string[];
        rank: number;
        tied: boolean;
    }[];
    comparisons: () => {
        index: number;
        a: {
            title: string;
            url: string;
        };
        b: {
            title: string;
            url: string;
        };
        verdict: Verdict;
        implied: boolean;
        conflicts: boolean;
        why: string | null;
    }[];
    conflicts: () => {
        index: number;
        a: {
            title: string;
            url: string;
        };
        b: {
            title: string;
            url: string;
        };
        verdict: Verdict;
        implied: boolean;
        conflicts: boolean;
        why: string | null;
    }[];
    lists: () => {
        id: string;
        name: string;
        items: number;
        answered: number;
        current: boolean;
    }[];
    placement: () => {
        placed: number;
        total: number;
        pct: number;
    };
    newList: (listName?: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    openList: (ref: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    renameList: (listName: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    deleteList: (ref?: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    load(list: unknown, { name: listName, replace }?: {
        name?: string;
        replace?: boolean;
    }): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    addItems: (list: unknown) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    setItemsText: (text: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    editItem: (title: string, patch: Partial<Item>) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    tag: (title: string, tags: string | string[]) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    untag(title: string, tags: string | string[]): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    bench: (title: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    /** Every title is resolved BEFORE anything changes, so one typo fails the whole batch. */
    benchMany: (titles: string[]) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    subIn(title: string): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    subAll: () => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    retire: (titles: string[]) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    removeItem: (title: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    restoreItem: (title: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    priority: () => {
        tag: string;
        weight: number | undefined;
    }[];
    setPriority: (tiers: Tier[]) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    combineBy: (mode: "order" | "weights") => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    overrides: () => import("../sorter.ts").Comparison[];
    dropOverrides: () => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    answer(choice: string): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    undo: () => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    deleteComparison: (i: number) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    resetAnswers: () => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    resolve: () => {
        before: number;
        after: number;
    };
    pause(): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    resume(): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    goto(screen: Screen): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    tab(which: "ranking" | "comparisons"): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    search: (text?: string) => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    expand(title: string, on?: boolean): Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    expandAll: () => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    collapseAll: () => Promise<{
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
    schema: () => number;
    exportJSON: () => import("../store.ts").ExportPayload;
    importJSON(data: unknown): Promise<{
        imported: {
            items: number;
            comparisons: number;
            skipped: number;
        };
        list: string;
        screen: Screen;
        paused: boolean;
        items: number;
        active: number;
        benched: string[];
        answered: number;
        estimatedTotal: number;
        placed: number;
        complete: boolean;
        pending: {
            a: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
            b: {
                title: string;
                url: string;
                media: string[];
                desc: string;
                tags: string[];
            };
        } | null;
        conflicts: number;
        priority: string[];
        weights: number[];
        combine: import("../engine.ts").Combine;
        tierOverrides: number;
        tags: string[];
        query: string;
        ranking: string[];
    }>;
};
