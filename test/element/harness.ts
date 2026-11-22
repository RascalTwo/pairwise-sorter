// Runs the web components in real headless Chrome. A Node server serves the library's own source,
// types stripped and instrumented with Istanbul, and each test opens a fixture page that imports it.
// The counters the page collects are saved per test for `r2-test-kit merge`, which merges them with
// the logic tests' counters and checks the coverage floor.

import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { relative } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { createInstrumenter } from "istanbul-lib-instrument";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { add, diff, OUT, writeRecord } from "@rascaltwo/r2-test-kit/record";

const ROOT = new URL("../../", import.meta.url).pathname;
const fixtures = new Map<string, string>();
const instrumenter = createInstrumenter({ esModules: true, compact: false, coverageGlobalScope: "globalThis", coverageGlobalScopeFunc: false });
let server: Server | null = null;
let browser: Browser | null = null;
/** What the pages of the running test counted, and the static maps they counted against. */
let counted = {};
let maps: Record<string, object> = {};

const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));

/** The source file a request names: only src/**.ts, instrumented. Positions survive type stripping, so lines match the source. */
function source(path: string): string | null {
  if (!/^\/src\/[\w/.-]+\.ts$/.test(path) || path.includes("..")) return null;
  const file = ROOT + path.slice(1);
  if (!existsSync(file)) return null;
  return instrumenter.instrumentSync(stripTypeScriptTypes(readFileSync(file, "utf8")), file);
}

async function start() {
  server ??= await new Promise<Server>((resolve) => {
    const s = createServer((req, res) => {
      const path = new URL(req.url!, "http://x").pathname;
      const html = fixtures.get(path);
      const js = html ? null : source(path);
      if (html) res.writeHead(200, { "content-type": "text/html" }).end(html);
      else if (js !== null) res.writeHead(200, { "content-type": "text/javascript" }).end(js);
      else if (path === "/test/element/px.svg") res.writeHead(200, { "content-type": "image/svg+xml" }).end(readFileSync(ROOT + path.slice(1)));
      else res.writeHead(404).end("not found");
    });
    s.listen(0, () => resolve(s));
  });
  if (!CHROME) throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
  browser ??= await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  return { port: (server.address() as AddressInfo).port, browser };
}

let n = 0;
const openPages = new Set<Page>();
/**
 * Open a page with `body` and a module `script`. The script can use `pw` (the core) and
 * `pwel` (the element entry); the page is ready once it has run.
 */
export async function open(body: string, script = ""): Promise<Page> {
  const { port, browser } = await start();
  const path = `/fixture/${++n}`;
  fixtures.set(path, `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}
<script type="module">
import * as pw from "/src/index.ts";
import * as pwel from "/src/element/index.ts";
window.pw = pw; window.pwel = pwel;
${script}
window.__ready = true;
</script></body></html>`);
  const page = await browser.newPage();
  openPages.add(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  (page as Page & { errors: string[] }).errors = errors;
  await page.goto(`http://localhost:${port}${path}`);
  await page.waitForFunction("window.__ready === true");
  return page;
}

/** Close a page, folding its coverage into the running test's. Throws if the page logged errors. */
export async function close(page: Page): Promise<void> {
  openPages.delete(page);
  const cov = (await page.evaluate("window.__coverage__ ?? {}")) as Record<string, object>;
  Object.assign(maps, cov);
  add(counted, diff({}, cov));
  const errors = (page as Page & { errors: string[] }).errors;
  await page.close();
  if (errors.length) throw new Error("page errors:\n" + errors.join("\n"));
}

/** Close pages a failed test left open, keeping their coverage. */
export async function closeLeftovers(): Promise<void> {
  for (const page of openPages) await close(page).catch(() => {});
}

/** Save what the finished test's pages counted as one record, for `r2-test-kit merge`. */
export function saveCoverage(name: string): void {
  if (Object.keys(counted).length) writeRecord(`${OUT}/e2e`, { runner: "vitest-chrome", name }, counted, maps, process.cwd());
  counted = {};
  maps = {};
}

export async function stop() {
  await browser?.close();
  server?.close();
  browser = null;
  server = null;
}

/** Text of the first element matching a selector that pierces shadow roots, whitespace collapsed. */
export const text = (page: Page, selector: string) =>
  page.$eval(selector, (el) => el.textContent!.replace(/\s+/g, " ").trim());
/** Texts of every match of a shadow-piercing selector, whitespace collapsed. */
export const texts = (page: Page, selector: string) =>
  page.$$eval(selector, (els) => els.map((el) => el.textContent!.replace(/\s+/g, " ").trim()));
