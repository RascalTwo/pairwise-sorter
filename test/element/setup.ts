// Preloaded for every test run. When element tests ran, fail the run unless every line of
// element code was executed in Chrome by some test — the browser-side half of the coverage gate.
import { afterAll, afterEach } from "bun:test";
import { closeLeftovers, coverage, stop, uncoveredLines } from "./harness.ts";

afterEach(closeLeftovers);

afterAll(async () => {
  await stop();
  if (!coverage.size) return;
  const missed = uncoveredLines();
  if (missed.length) throw new Error(`element code not covered in Chrome (${missed.length} lines):\n${missed.join("\n")}`);
});
