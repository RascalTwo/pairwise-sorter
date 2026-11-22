import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** A hash of the docs viz's source: the page and its hero card. */
export async function docsSourceHash(): Promise<string> {
  const h = createHash("sha256");
  for (const f of ["viz-pages/docs/index.html", "viz-pages/docs/hero.html"]) h.update(await readFile(f, "utf8"));
  return h.digest("hex");
}
