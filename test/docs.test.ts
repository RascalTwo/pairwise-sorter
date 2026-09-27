import { expect, test } from "bun:test";
import { docsSourceHash } from "../scripts/docs-hash.ts";

test("the published docs page is up to date with its viz source", async () => {
  // GIVEN the committed, published docs page
  const published = await Bun.file(new URL("../pages/docs/index.html", import.meta.url)).text();
  // WHEN its source stamp is compared with the viz source as it is now
  const stamp = published.match(/<!-- docs-source-sha256: ([0-9a-f]{64}) -->/)?.[1];
  // THEN they match — otherwise run `bun run docs:publish`
  expect(stamp, "pages/docs/index.html is stale: run `bun run docs:publish`").toBe(await docsSourceHash());
});
