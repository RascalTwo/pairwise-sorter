// Publish the docs viz (viz-pages/docs/) into pages/docs/, which GitHub Pages serves at /docs/.
// Needs the /viz skill (VIZ_SKILL_DIR, default ~/.claude/skills/viz), which CI does not have —
// so the output is committed, stamped with a hash of its source. test/docs.test.ts fails when
// the stamp no longer matches, i.e. when the viz was edited but not re-published.
import { $ } from "bun";
import { docsSourceHash } from "./docs-hash.ts";

const viz = `${process.env.VIZ_SKILL_DIR ?? `${process.env.HOME}/.claude/skills/viz`}/viz.ts`;
await $`bun ${viz} publish viz-pages --out .viz-publish --no-index --no-deploy-notice --base-url https://rascaltwo.github.io/pairwise-sorter/`;
const html = await Bun.file(".viz-publish/docs/index.html").text();
await Bun.write("pages/docs/index.html", `${html}\n<!-- docs-source-sha256: ${await docsSourceHash()} -->\n`);
await Bun.write("pages/docs/og.auto.png", Bun.file(".viz-publish/docs/og.auto.png"));
console.log("pages/docs/ updated");
