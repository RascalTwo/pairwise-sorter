# pairwise-sorter

Rank anything by answering "which is better?" one pair at a time. Binary insertion with you
as the comparator: about n·log₂n questions instead of comparing everything to everything,
and adding an item later costs only ~log₂n more.

```sh
npm i github:RascalTwo/pairwise-sorter
```

Installing from GitHub needs no build: the compiled `dist/` is committed. After changing `src/`, run `npm run compile` and commit `dist/` (a test fails until you do).

```js
import { Sorter, emptyList, item } from "@rascaltwo/pairwise-sorter";

const sorter = new Sorter({ ...emptyList("Coffee"), items: ["Flat white", "Cold brew", "Mocha"].map((t) => item(t)) });
sorter.addEventListener("change", () => save(sorter.list));   // the library never stores anything itself

await sorter.settled();
while (sorter.question) {
  const { a, b } = sorter.question;               // indices into sorter.list.items
  await sorter.answer(await askAHuman(a, b));     // -1 left wins · 1 right wins · 0 equal
}
console.log(sorter.ranking().map((r) => `${r.rank}. ${r.item.title}`));
```

Try it: <https://rascaltwo.github.io/pairwise-sorter/> · Documentation: <https://rascaltwo.github.io/pairwise-sorter/docs/>

## Develop

```sh
npm ci
npm test          # behaviour tests (browser ones in headless Chrome); fails under 100% coverage
npm run typecheck
npm run site      # build what GitHub Pages serves into site/: the app, docs/, api/ (TypeDoc)
```

The docs page is a [/viz](https://github.com/RascalTwo/ai-setup) page in `viz-pages/docs/` (`npm run docs:dev` builds the
library beside it for the local viz server). After editing it or its `hero.html`, `npm run docs:publish` (needs the viz
skill) regenerates the committed `pages/docs/`; a test fails until you do. The page loads the library at runtime, so
library changes reach the docs demo on the next deploy without re-publishing.

MIT licensed.
