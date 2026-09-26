// Runs the web components in real headless Chrome. Bun serves the built package; each test
// opens a fixture page that imports it. Chrome's own V8 coverage is collected for the element
// code (Bun cannot see code that runs in a browser) and gated at 100% in `setup.ts`.

import { existsSync } from "node:fs";
import puppeteer, { type Browser, type CoverageEntry, type Page } from "puppeteer-core";

const ROOT = new URL("../../", import.meta.url).pathname;
const fixtures = new Map<string, string>();
let server: ReturnType<typeof Bun.serve> | null = null;
let browser: Browser | null = null;
let built = false;
/** Covered and total character ranges per element script, merged across every page. */
export const coverage = new Map<string, { text: string; covered: [number, number][] }>();

const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));

async function start() {
  if (!built) {
    const tsc = Bun.spawnSync(["bun", "run", "build"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    if (tsc.exitCode !== 0) throw new Error("build failed:\n" + tsc.stdout.toString() + tsc.stderr.toString());
    built = true;
  }
  server ??= Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      const html = fixtures.get(path);
      if (html) return new Response(html, { headers: { "content-type": "text/html" } });
      const file = Bun.file(ROOT + path.slice(1));
      return file.size ? new Response(file) : new Response("not found", { status: 404 });
    },
  });
  if (!CHROME) throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
  browser ??= await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  return { server, browser };
}

let n = 0;
const openPages = new Set<Page>();
/**
 * Open a page with `body` and a module `script`. The script can use `pw` (the core) and
 * `pwel` (the element entry); the page is ready once it has run.
 */
export async function open(body: string, script = ""): Promise<Page> {
  const { server, browser } = await start();
  const path = `/fixture/${++n}`;
  fixtures.set(path, `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}
<script type="module">
import * as pw from "/dist/index.js";
import * as pwel from "/dist/element/index.js";
window.pw = pw; window.pwel = pwel;
${script}
window.__ready = true;
</script></body></html>`);
  const page = await browser.newPage();
  openPages.add(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  (page as Page & { errors: string[] }).errors = errors;
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.goto(`http://localhost:${server.port}${path}`);
  await page.waitForFunction("window.__ready === true");
  return page;
}

/** Close a page, folding its coverage into the running total. Throws if the page logged errors. */
export async function close(page: Page): Promise<void> {
  openPages.delete(page);
  record(await page.coverage.stopJSCoverage());
  const errors = (page as Page & { errors: string[] }).errors;
  await page.close();
  if (errors.length) throw new Error("page errors:\n" + errors.join("\n"));
}

function record(entries: CoverageEntry[]) {
  for (const e of entries) {
    const m = e.url.match(/\/dist\/element\/.+\.js$/);
    if (!m) continue;
    const cur = coverage.get(m[0]) ?? { text: e.text, covered: [] };
    cur.covered.push(...e.ranges.map((r): [number, number] => [r.start, r.end]));
    coverage.set(m[0], cur);
  }
}

/** Lines of element code no page ever ran. Blank, comment and bracket-only lines don't count. */
export function uncoveredLines(): string[] {
  const out: string[] = [];
  for (const [url, { text, covered }] of coverage) {
    const hit = new Uint8Array(text.length);
    for (const [s, e] of covered) hit.fill(1, s, e);
    let pos = 0;
    text.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").trim();
      const missed = [...line].some((ch, j) => !hit[pos + j] && ch.trim());
      if (missed && code && !/^[\s})\];,]*$/.test(code) && !/^(\*|\/\*\*|\*\/)/.test(code)) out.push(`${url}:${i + 1}: ${code}`);
      pos += line.length + 1;
    });
  }
  return out;
}

/** Close pages a failed test left open, keeping their coverage. */
export async function closeLeftovers(): Promise<void> {
  for (const page of openPages) await close(page).catch(() => {});
}

export async function stop() {
  await browser?.close();
  server?.stop(true);
  browser = null;
  server = null;
}

/** Text of the first element matching a selector that pierces shadow roots, whitespace collapsed. */
export const text = (page: Page, selector: string) =>
  page.$eval(selector, (el) => el.textContent!.replace(/\s+/g, " ").trim());
/** Texts of every match of a shadow-piercing selector, whitespace collapsed. */
export const texts = (page: Page, selector: string) =>
  page.$$eval(selector, (els) => els.map((el) => el.textContent!.replace(/\s+/g, " ").trim()));
