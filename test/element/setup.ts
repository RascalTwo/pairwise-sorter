// Preloaded for every test run. When element tests ran, fail the run unless every line of
// element code was executed in Chrome by some test — the browser-side half of the coverage gate.
import { afterAll, afterEach, setDefaultTimeout } from "bun:test";
import { closeLeftovers, coverage, stop, uncoveredLines } from "./harness.ts";

// The first browser test also pays for the build and a Chrome launch, which is slow on CI.
setDefaultTimeout(30_000);
afterEach(closeLeftovers);

afterAll(async () => {
  await stop();
  if (!coverage.size) return;
  const missed = uncoveredLines();
  if (missed.length) throw new Error(`element code not covered in Chrome (${missed.length} lines):\n${missed.join("\n")}`);
});
