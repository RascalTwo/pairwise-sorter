// Runs after every element test file: closes pages a failed test left open, saves the test's
// browser coverage for `r2-test-kit merge`, and shuts Chrome down at the end of the file.
import { relative } from "node:path";
import { afterAll, afterEach, expect } from "vitest";
import { closeLeftovers, saveCoverage, stop } from "./harness.ts";

// The string and type matchers the tests were written with, which vitest lacks.
declare module "vitest" {
  interface Assertion {
    toStartWith(prefix: string): void;
    toEndWith(suffix: string): void;
    toBeString(): void;
  }
}
const affix = (name: string, test: (s: string, x: string) => boolean) =>
  function (this: { isNot: boolean }, received: unknown, x: string) {
    return { pass: typeof received === "string" && test(received, x), message: () => `expected ${JSON.stringify(received)} ${this.isNot ? "not " : ""}to ${name} ${JSON.stringify(x)}` };
  };
expect.extend({
  toStartWith: affix("start with", (s, x) => s.startsWith(x)),
  toEndWith: affix("end with", (s, x) => s.endsWith(x)),
  toBeString: (received: unknown) => ({ pass: typeof received === "string", message: () => `expected ${JSON.stringify(received)} to be a string` }),
});

afterEach(async () => {
  await closeLeftovers();
  const { testPath, currentTestName } = expect.getState();
  saveCoverage(`${relative(process.cwd(), testPath ?? "unknown")} > ${currentTestName}`);
});

afterAll(stop);
