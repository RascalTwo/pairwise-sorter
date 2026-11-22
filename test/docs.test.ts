import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { docsSourceHash } from "../scripts/docs-hash.ts";

test("the published docs page is up to date with its viz source", async () => {
  // GIVEN the committed, published docs page
  const published = await readFile(new URL("../pages/docs/index.html", import.meta.url), "utf8");
  // WHEN its source stamp is compared with the viz source as it is now
  const stamp = published.match(/<!-- docs-source-sha256: ([0-9a-f]{64}) -->/)?.[1];
  // THEN they match — otherwise run `npm run docs:publish`
  expect(stamp, "pages/docs/index.html is stale: run `npm run docs:publish`").toBe(await docsSourceHash());
});
