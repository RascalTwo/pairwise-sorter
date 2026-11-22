# Run on Node and count the browser tests' coverage with Istanbul

Status: Accepted, 2026-11-22

## Context and Problem Statement

The repo ran on Bun: `bun test`, `Bun.serve` in the browser harness, `Bun.file`, `Bun.spawnSync`, `bunx` in `prepare`. Joseph decided that every use of Bun moves to Node 24 (the `r2-app-stack` skill). Bun's `coverageThreshold` only counted lines and functions, and Bun can't see code that runs in Chrome, so `test/element/setup.ts` gated Chrome's V8 coverage by hand, once per whole run. vitest runs `setupFiles` once per test file, so that run-wide gate has nowhere to live.

## Decision

Tests run on vitest, with scripts on Node's own APIs and npm with `package-lock.json`. Coverage is Istanbul everywhere, merged by the shared `r2-test-kit` with a floor in `coverage-floor.json` that covers branches too.

The element tests' harness serves `src/**/*.ts` to Chrome straight from source: `stripTypeScriptTypes` (strip mode keeps every line and column) and then Istanbul instrumentation. So the page's `window.__coverage__` already points at the source files, and no `dist/` build is needed to run the tests. After each test the harness writes the page's counters as a record the kit merges with the logic tests' (`@rascaltwo/r2-test-kit/record`).

The floor is rounded down to whole percents (99 lines, 99 statements, 99 functions, 93 branches): the kit's exact-value ratchet flaps on 0.01 noise. It is lower than the old 100% lines gate because Istanbul counts statements and branch arms Bun did not; `engine.ts` has two uncovered lines, and the floor only rises from here.

Not decided here: a published `r2-test-kit`. It installs from the sibling `ai-setup` checkout (`file:../ai-setup/tools/r2-test-kit`), so `npm ci` in GitHub Actions fails until the kit is published or vendored.

## Alternatives Considered

- Keep Chrome's V8 coverage for the element code: line-only, can't be merged with the logic tests' Istanbul counters, and its run-wide gate needs a vitest global teardown the workers can't feed.
- Instrument the compiled `dist/` output: its lines and branches no longer match `src/`, so the report and floor would name files nobody edits.
- Playwright with the kit's own fixture: the right long-term tool, but a port of every element test for no gain here; puppeteer-core stays until a suite is rewritten anyway.

## More Information

Decided by Joseph on 2026-11-07 and 2026-11-08; the kit's `record` export was added for this in `ai-setup`.
