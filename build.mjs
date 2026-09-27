// Standalone static bundler for the GitHub Pages export of the Letter
// Reversal Game. Independent of the space SDK's buildClient (which is
// reserved for the hosted web-artifact pipeline): this produces a plain
// static ./dist directory for GitHub Pages.
//
// NOTE: the space's own source of truth stays in
// ~/workspace/ts-spaces/letter-reversal-game (built only via the artifact
// tools). This directory is a deployment export: client source copied over,
// server actions replaced by the localStorage layer in src/api.ts.

import { rm } from "node:fs/promises";
import { basename } from "node:path";
import tailwindPlugin from "bun-plugin-tailwind";

const ENTRY = "./index.html";
const OUTDIR = "./dist";

await rm(OUTDIR, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUTDIR,
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("static export build failed; see logged diagnostics");
}

// Bun writes imported assets to `assets/<name>-<hash>.<ext>` but emits the
// JS/CSS import URL as a bare `./<name>-<hash>.<ext>` (no `assets/` prefix).
// Re-prefix those bare refs to `./assets/...` so relative URLs resolve when
// the site is served from a subpath (e.g. <user>.github.io/<repo>/).
const assetFiles = result.outputs
  .filter((output) => output.kind === "asset")
  .map((output) => basename(output.path));

if (assetFiles.length > 0) {
  for (const output of result.outputs) {
    if (!/\.(js|css|html)$/.test(output.path)) continue;
    let text = await output.text();
    let changed = false;
    for (const name of assetFiles) {
      const bare = `./${name}`;
      if (text.includes(bare)) {
        text = text.split(bare).join(`./assets/${name}`);
        changed = true;
      }
    }
    if (changed) await Bun.write(output.path, text);
  }
}

console.log(`built ${OUTDIR} OK`);
