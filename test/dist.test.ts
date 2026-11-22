import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

async function files(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    // source maps name their sources relative to the output folder, so they differ for a scratch folder
    if (!entry.isFile() || entry.name.endsWith(".map")) continue;
    const path = join(entry.parentPath, entry.name);
    out[path.slice(dir.length)] = await readFile(path, "utf8");
  }
  return out;
}

test("the committed dist/ is what `npm run compile` builds from src/", async () => {
  // GIVEN the committed dist/, which git installs ship as they are (no build step runs on install)
  const root = new URL("..", import.meta.url).pathname;
  const fresh = await mkdtemp(join(tmpdir(), "pairwise-dist-"));
  try {
    // WHEN src/ is compiled again into an empty folder
    const tsc = spawnSync("npx", ["tsc", "-p", "tsconfig.build.json", "--outDir", fresh], { cwd: root, encoding: "utf8" });
    expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
    // THEN every file matches — otherwise run `npm run compile` and commit dist/
    expect(await files(join(root, "dist")), "dist/ is stale: run `npm run compile`").toEqual(await files(fresh));
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
});
