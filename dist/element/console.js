// A scripting API on `window`, so a person at the DevTools console — or an agent driving the
// page — never has to click. Every mutating call resolves to the settled state, so "do it AND
// tell me what happened" is one call.
import { idOf, tagOf } from "../item.js";
import { fromJSON, parseItems } from "../parse.js";
import { importList, resolveList, SCHEMA } from "../store.js";
const HELP = `pairwiseSorter — rank a list by pairwise comparison. Every UI action has a method here.

READ
  help()               this text
  state()              current list, screen, progress, the pair being asked, conflict count
                       (readers are sync; every method that CHANGES something returns a
                        Promise of the settled state — await it)
  ranking()            [{rank, tied, title, url, media, desc, tags}] — final, or partial while sorting
  comparisons()        [{index, a, b, verdict, implied, conflicts, why}] every answer (verdict: -1 a, 1 b, 0 equal)
  conflicts()          only the answers the ranking contradicts
  lists()              [{id, name, items, answered, current}]
  placement()          {placed, total, pct} — placed items are already final

LISTS
  newList(name?)  openList(ref)  renameList(name)  deleteList(ref?)   — ref is an id or a unique name

ITEMS   item = string | {title, url?, media?: string[], desc?, tags?: string[]}
  load(items, {name, replace=true})   set the list's items (the usual entry point)
  addItems(items)      append; only new items get asked about (~log2(n) questions each)
  setItemsText(text)   the same, in the text syntax (pipes / markdown links / #tags / JSON)
  editItem(title, patch)   change {title, url, desc, media, tags}; a rename keeps its answers
  tag(title, tags) / untag(title, tags)
  bench(title) / benchMany(titles) / subIn(title) / subAll()
  removeItem(title) / restoreItem(title)   the old names for bench / subIn
  retire(titles)       remove finished items for good WITHOUT re-asking: answers they carried are
                       filled in from the current order and marked implied

TIERS
  priority()  setPriority(tags | [{tag, weight}])  combineBy('order'|'weights')
  overrides()  dropOverrides()

ANSWERING
  answer('a'|'b'|'equal')   also 'left' / 'right' / 'tie' / 'same'
  undo()  deleteComparison(i)  resetAnswers()  resolve()

SEARCH  display only — never changes what is compared, stored or saved
  search(text)         filter every list view by title. search('') clears it

VIEWS
  pause() / resume()   goto('setup'|'import'|'compare'|'done')   tab('ranking'|'comparisons')
  expand(title, on?)   open a ranked row to show its media and description
  expandAll() / collapseAll()

DATA
  schema()  exportJSON()  importJSON(data)

NOTE: if an AI answers the questions, the ranking is the AI's preferences, not yours.`;
const CHOICES = { a: -1, left: -1, b: 1, right: 1, equal: 0, tie: 0, same: 0 };
const pub = (it) => ({ title: it.title, url: it.url, media: it.media, desc: it.desc, tags: it.tags });
const asItems = (list) => [list].flat().map(fromJSON).filter((x) => !!x);
/** Put the console API for a `<pairwise-sorter>` on `window[name]` and return it. */
export function installConsole(el, name = "pairwiseSorter") {
    const s = () => el.sorter;
    const items = () => s().list.items;
    /** An item by exact title. Ambiguity is an error, never a silent first match. */
    const find = (title) => {
        const hits = items().flatMap((it, i) => (it.title === title ? [i] : []));
        if (hits.length === 1)
            return hits[0];
        if (!hits.length)
            throw new Error(`no item titled ${JSON.stringify(title)}`);
        throw new Error(`${hits.length} items are titled ${JSON.stringify(title)} — titles must be unique to address one`);
    };
    const state = () => {
        const sorter = s(), q = sorter.question, screen = el.screen;
        const asking = q && screen === "compare";
        return {
            list: sorter.list.name, screen, paused: el.paused, items: items().length, active: sorter.live().length,
            benched: sorter.benchedItems().map((i) => i.title), answered: sorter.list.log.length,
            estimatedTotal: sorter.budget(), placed: sorter.ranking().length, complete: sorter.complete,
            pending: asking ? { a: pub(items()[q.a]), b: pub(items()[q.b]) } : null,
            conflicts: sorter.comparisons().filter((c) => c.why).length,
            priority: [...sorter.list.priority], weights: [...sorter.list.weights], combine: sorter.list.combine,
            tierOverrides: sorter.overrides().length, tags: sorter.tags(), query: el.query, ranking: sorter.ranking().map((r) => r.item.title),
        };
    };
    const ranking = () => el.shadowRoot.querySelector("pairwise-ranking");
    const settled = async (work) => { await work; await s().settled(); return state(); };
    const setItems = (next) => { s().setItems(next); el.goto("compare"); return settled(); };
    const api = {
        version: "2",
        help: () => HELP,
        state,
        ranking: () => s().ranking().map((r) => ({ rank: r.rank, tied: r.tied, ...pub(r.item) })),
        comparisons: () => s().comparisons().map((c) => ({ index: c.index, a: c.a, b: c.b, verdict: c.verdict, implied: c.implied, conflicts: !!c.why, why: c.why })),
        conflicts: () => api.comparisons().filter((c) => c.conflicts),
        lists: () => Object.entries(el.library.lists).map(([id, l]) => ({
            id, name: l.name, items: l.items.length, answered: l.log.length, current: id === el.library.current,
        })),
        placement: () => s().placement(),
        newList: (listName) => settled(el.newList(listName)),
        openList: (ref) => settled(el.openList(resolveList(el.library, ref))),
        renameList: (listName) => settled(el.renameList(String(listName))),
        deleteList: (ref) => settled(el.deleteList(ref === undefined ? el.library.current : resolveList(el.library, ref))),
        load(list, { name: listName, replace = true } = {}) {
            const next = asItems(list);
            if (!next.length)
                throw new Error("no items given");
            const all = replace ? next : [...items(), ...next];
            if (all.length < 2)
                throw new Error("need at least 2 items in the list");
            if (listName)
                el.renameList(listName);
            return setItems(all);
        },
        addItems: (list) => api.load(list, { replace: false }),
        setItemsText: (text) => setItems(parseItems(String(text))),
        editItem: (title, patch) => settled(s().editItem(find(title), patch)),
        tag: (title, tags) => api.editItem(title, { tags: [...items()[find(title)].tags, ...[tags].flat()] }),
        untag(title, tags) {
            const drop = new Set([tags].flat().map(tagOf));
            return api.editItem(title, { tags: items()[find(title)].tags.filter((t) => !drop.has(t)) });
        },
        bench: (title) => api.benchMany([title]),
        /** Every title is resolved BEFORE anything changes, so one typo fails the whole batch. */
        benchMany: (titles) => settled(s().bench(titles.map((t) => idOf(items()[find(t)])))),
        subIn(title) {
            const it = s().benchedItems().find((b) => b.title === title);
            if (!it)
                throw new Error(`${JSON.stringify(title)} is not benched`);
            return settled(s().subIn(idOf(it)));
        },
        subAll: () => settled(s().subAll()),
        // The pre-"bench" names, so scripts written against the original page keep working.
        retire: (titles) => settled(s().retire([titles].flat().map((t) => idOf(items()[find(t)])))),
        removeItem: (title) => api.bench(title),
        restoreItem: (title) => api.subIn(title),
        priority: () => s().list.priority.map((tag, i) => ({ tag, weight: s().list.weights[i] })),
        setPriority: (tiers) => settled(s().setPriority(tiers)),
        combineBy: (mode) => settled(s().setCombine(mode)),
        overrides: () => s().overrides(),
        dropOverrides: () => settled(s().dropOverrides()),
        answer(choice) {
            const v = CHOICES[String(choice).toLowerCase()];
            if (v === undefined)
                throw new Error("answer expects 'a' | 'b' | 'equal'");
            const screen = el.screen;
            if (!s().question || screen === "setup" || screen === "import")
                throw new Error("nothing is being asked right now — screen is " + screen);
            return settled(s().answer(v));
        },
        undo: () => settled(s().undo()),
        deleteComparison: (i) => settled(s().deleteAnswer(i)),
        resetAnswers: () => settled(s().resetAnswers()),
        resolve: () => s().resolve(),
        pause() { if (!el.pause())
            throw new Error("nothing to pause — no question is open"); return settled(); },
        resume() { if (!el.resume())
            throw new Error("nothing to resume"); return settled(); },
        goto(screen) {
            if (!["setup", "import", "compare", "done"].includes(screen))
                throw new Error("unknown screen: " + screen);
            el.goto(screen);
            return settled();
        },
        tab(which) {
            if (which !== "ranking" && which !== "comparisons")
                throw new Error("tab expects 'ranking' or 'comparisons'");
            el.tab(which);
            return settled();
        },
        search: (text) => { el.search(String(text ?? "")); return settled(); },
        expand(title, on = true) {
            const i = find(title), it = items()[i];
            if (!it.media.length && !it.desc)
                throw new Error(`${JSON.stringify(title)} has no media or description to show`);
            ranking().expand(i, on);
            return settled();
        },
        expandAll: () => { ranking().expandAll(); return settled(); },
        collapseAll: () => { ranking().collapseAll(); return settled(); },
        schema: () => SCHEMA,
        exportJSON: () => el.exportJSON(),
        async importJSON(data) {
            const r = importList(typeof data === "string" ? JSON.parse(data) : data);
            el.addList(r.list);
            return { ...(await settled()), imported: { items: r.count, comparisons: r.kept, skipped: r.skipped } };
        },
    };
    globalThis[name] = api;
    return api;
}
//# sourceMappingURL=console.js.map