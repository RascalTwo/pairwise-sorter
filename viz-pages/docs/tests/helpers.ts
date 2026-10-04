// Shared by the docs page's tests. The page has no backend, but it loads the LIBRARY it documents at run time
// (./dist/index.js, built by `bun run docs:dev`, not in git), so these tests run the real library: the trace, the
// cost chart and the live elements are the library's own answers. The one outside dependency, highlight.js
// from cdnjs, only colours the code samples, so a five-line stand-in answers it; every other cross-origin
// request is refused so a test never touches the network.
import type { HTTPRequest, Page } from "puppeteer-core";

declare global {
  var viz: {
    open(
      hash?: string | object,
      o?: { width?: number; height?: number; before?: (p: Page) => unknown },
    ): Promise<Page & { errors: string[] }>;
  };
}

const BASE = new URL(process.env.VIZ_URL!.replace(/#.*$/u, ""));

const answer = async (req: HTTPRequest): Promise<void> => {
  if (req.isInterceptResolutionHandled()) return;
  const u = new URL(req.url());
  if (u.hostname === "cdnjs.cloudflare.com" && u.pathname.endsWith(".js"))
    await req.respond({
      status: 200,
      contentType: "text/javascript",
      body: "window.hljs = { highlightAll() {} };",
    });
  else if (u.hostname === "cdnjs.cloudflare.com" && u.pathname.endsWith(".css"))
    await req.respond({ status: 200, contentType: "text/css", body: "" });
  else if (u.origin !== BASE.origin) await req.abort("blockedbyclient");
  else if (u.pathname.includes("/_log/"))
    await req.respond({ status: 200, contentType: "application/json", body: "[]" });
  else await req.continue();
};

export async function open(hash?: object): Promise<Page & { errors: string[] }> {
  const page = await viz.open(hash, {
    width: 1300,
    height: 900,
    before: async (p) => {
      await p.setRequestInterception(true);
      p.on("request", (req) => {
        // oxlint-disable-next-line no-void -- puppeteer's handler type is void, so a failed answer stays a stray rejection as before
        void answer(req);
      });
    },
  });
  // The page is ready once the library is loaded and the trace and the live elements have drawn.
  await page.waitForFunction(
    () =>
      !!document.querySelector("#howAt")?.textContent &&
      !!document.querySelector("pairwise-compare")?.shadowRoot?.querySelector("[part=duel] .card"),
    { timeout: 20_000 },
  );
  return page;
}

export const text = async (page: Page, sel: string): Promise<string> => {
  const t = await page.$eval(sel, (e) => (e.textContent ?? "").replaceAll(/\s+/gu, " ").trim());
  return t;
};

/** Read inside one of the live elements' shadow roots. */
export const inside = async <T>(
  page: Page,
  host: string,
  fn: (root: ShadowRoot) => T,
): Promise<Awaited<T>> => {
  const v = await page.evaluate<[], () => T>(
    `(${fn.toString()})(document.querySelector(${JSON.stringify(host)}).shadowRoot)`,
  );
  return v;
};

/** The two titles the comparison is asking about now, or null when it is idle. */
export const question = async (page: Page): Promise<{ a: string; b: string } | null> => {
  const q = await inside(page, "pairwise-compare", (r) => {
    const t = (s: string) => r.querySelector(`[part~=title-${s}]`)?.textContent ?? null;
    const a = t("a"),
      b = t("b");
    return a && b ? { a, b } : null;
  });
  return q;
};

/** The ranking as it is listed: [rank, title] in order. */
export const ranking = async (page: Page): Promise<[string, string][]> => {
  const rows = await inside(page, "pairwise-ranking", (r) =>
    [...r.querySelectorAll("[part=list] [part=row]")].map((li): [string, string] => [
      li.querySelector("[part=rank]")!.textContent,
      li.querySelector("[part=title]")!.textContent.trim(),
    ]),
  );
  return rows;
};

/** The progress line, e.g. "3 of ~11 comparisons · 2 of 6 placed". */
export const progress = async (page: Page): Promise<string> => {
  const t = await inside(page, "pairwise-progress", (r) =>
    r.querySelector("[part=status]")!.textContent.replaceAll(/\s+/gu, " ").trim(),
  );
  return t;
};

/** Wait for the comparison to change from `then` (a new pair, or none). */
export const nextQuestion = async (
  page: Page,
  then: { a: string; b: string } | null,
): Promise<{ a: string; b: string } | null> => {
  for (let i = 0; i < 200; i++) {
    // oxlint-disable-next-line no-await-in-loop -- polling: each check must follow the previous one
    const q = await question(page);
    if ((q?.a ?? null) !== (then?.a ?? null) || (q?.b ?? null) !== (then?.b ?? null)) return q;
    // oxlint-disable-next-line no-await-in-loop -- polling: wait between checks
    await Bun.sleep(25);
  }
  throw new Error("the comparison never moved on from " + JSON.stringify(then));
};
