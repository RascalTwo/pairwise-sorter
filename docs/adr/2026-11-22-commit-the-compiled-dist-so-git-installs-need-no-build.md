# Commit the compiled dist so git installs need no build

Status: Accepted, 2026-11-22

## Context and Problem Statement

`ai-setup`'s viz skill installs this package as a git dependency (`github:RascalTwo/pairwise-sorter#<sha>`) and bundles it. npm prepares a git dependency by cloning it into its cache, running `npm install` there with devDependencies, then running `prepare`. It does that when the manifest has any of `prepare`, `build`, `prepack`, `install`, `preinstall` or `postinstall` (pacote's `git.js`). Since the move off Bun, a devDependency is `@rascaltwo/r2-test-kit` at `file:../ai-setup/tools/r2-test-kit`, which only resolves when `ai-setup` sits beside the checkout. In npm's cache clone it doesn't, so `npm install` of any commit from `96e9b97` on failed with `ENOENT .../_cacache/tmp/ai-setup/tools/r2-test-kit/package.json`, and viz stayed on the old pin.

## Decision

`dist/` is committed, and the manifest has no script npm treats as a build step: `prepare` is gone and `build` is now `compile`. A git install then copies the files as they are and never installs devDependencies.

A test (`test/dist.test.ts`) compiles `src/` into a scratch folder and fails until the committed `dist/` `.js` and `.d.ts` files match, the same guard the published docs page has. Source maps are left out of the comparison because they name their sources relative to the output folder. After changing `src/`, run `npm run compile` and commit `dist/`.

We accept a generated folder in git and one more command per source change; the test keeps it honest.

## Alternatives Considered

- Keep `prepare` and drop the kit from devDependencies: the kit is imported by `vitest.config.ts` and the element harness, so it would have to be installed by hand (`npm i --no-save`) in every checkout and in CI, and `package.json` would not declare what the tests import. Every consumer install would also still download vitest, vite, typedoc and puppeteer to compile.
- Depend on the kit by a URL npm can resolve: the kit lives in a subfolder of `ai-setup`, which npm can't install from a git URL. Revisit when it gets its own repo or an npm release (see the Bun-to-Node ADR).
- Export `src/*.ts` instead of `dist/`: Node refuses to strip types from files under `node_modules`, so plain Node consumers could no longer import the package.
- A separate `dist` branch or tag holding built output: a second publish path for one folder, and consumers would pin commits that aren't on `main`.

## More Information

Follows [2026-11-22-run-on-node-and-count-browser-coverage-with-istanbul.md](2026-11-22-run-on-node-and-count-browser-coverage-with-istanbul.md), whose `file:` kit dependency caused the failure. Baseline log of the failing install: `ENOENT` under npm's `_cacache/tmp/ai-setup/tools/r2-test-kit`.
