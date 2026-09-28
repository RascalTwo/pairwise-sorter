// Shared by the docs page's tests. The page has no backend, but it loads the LIBRARY it documents at run time
// (./dist/index.js, built by `bun run docs:dev`, not in git), so these tests run the real library: the trace, the
// cost chart and the live elements are the library's own answers. The one outside dependency, highlight.js
// from cdnjs, only colours the code samples, so a five-line stand-in answers it; every other cross-origin
// request is refused so a test never touches the network.
import type { Page } from "puppeteer-core";

declare global {
  // eslint-disable-next-line no-var
  var viz: {
    open(hash?: string | object, o?: { width?: number; height?: number; before?: (p: Page) => unknown }): Promise<Page & { errors: string[] }>;
  };
}

const BASE = new URL(process.env.VIZ_URL!.replace(/#.*$/, ""));

export async function open(hash?: object): Promise<Page & { errors: string[] }> {
  const page = await viz.open(hash, {
    width: 1300, height: 900,
    before: async (p) => {
      await p.setRequestInterception(true);
      p.on("request", (req) => {
        if (req.isInterceptResolutionHandled()) return;
        const u = new URL(req.url());
        if (u.hostname === "cdnjs.cloudflare.com" && u.pathname.endsWith(".js")) return req.respond({ status: 200, contentType: "text/javascript", body: "window.hljs = { highlightAll() {} };" });
        if (u.hostname === "cdnjs.cloudflare.com" && u.pathname.endsWith(".css")) return req.respond({ status: 200, contentType: "text/css", body: "" });
        if (u.origin !== BASE.origin) return req.abort("blockedbyclient");
        if (/\/_log\//.test(u.pathname)) return req.respond({ status: 200, contentType: "application/json", body: "[]" });
        return req.continue();
      });
    },
  });
  // The page is ready once the library is loaded and the trace and the live elements have drawn.
  await page.waitForFunction(() => !!document.querySelector("#howAt")?.textContent && !!document.querySelector("pairwise-compare")?.shadowRoot?.querySelector("[part=duel] .card"), { timeout: 20_000 });
  return page;
}

export const text = (page: Page, sel: string) => page.$eval(sel, (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());

/** Read inside one of the live elements' shadow roots. */
export const inside = <T>(page: Page, host: string, fn: (root: ShadowRoot) => T): Promise<T> =>
  page.evaluate((h, src) => (new Function("root", `return (${src})(root)`) as (r: ShadowRoot) => unknown)(document.querySelector(h)!.shadowRoot!), host, fn.toString()) as Promise<T>;

/** The two titles the comparison is asking about now, or null when it is idle. */
export const question = (page: Page) => inside(page, "pairwise-compare", (r) => {
  const t = (s: string) => r.querySelector(`[part~=title-${s}]`)?.textContent ?? null;
  const a = t("a"), b = t("b");
  return a && b ? { a, b } : null;
});

/** The ranking as it is listed: [rank, title] in order. */
export const ranking = (page: Page) => inside(page, "pairwise-ranking", (r) =>
  [...r.querySelectorAll("[part=list] [part=row]")].map((li) => [li.querySelector("[part=rank]")!.textContent!, li.querySelector("[part=title]")!.textContent!.trim()] as [string, string]));

/** The progress line, e.g. "3 of ~11 comparisons · 2 of 6 placed". */
export const progress = (page: Page) => inside(page, "pairwise-progress", (r) => r.querySelector("[part=status]")!.textContent!.replace(/\s+/g, " ").trim());

/** Wait for the comparison to change from `then` (a new pair, or none). */
export const nextQuestion = async (page: Page, then: { a: string; b: string } | null) => {
  for (let i = 0; i < 200; i++) {
    const q = await question(page);
    if ((q?.a ?? null) !== (then?.a ?? null) || (q?.b ?? null) !== (then?.b ?? null)) return q;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("the comparison never moved on from " + JSON.stringify(then));
};
