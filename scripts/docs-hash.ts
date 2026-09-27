/** A hash of the docs viz's source: the page and its hero card. */
export async function docsSourceHash(): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  for (const f of ["viz-pages/docs/index.html", "viz-pages/docs/hero.html"]) h.update(await Bun.file(f).text());
  return h.digest("hex");
}
