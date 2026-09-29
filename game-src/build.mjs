// Standalone static bundler for the GitHub Pages export of the Letter
// Reversal Game. Independent of the space SDK's buildClient (which is
// reserved for the hosted web-artifact pipeline): this produces a plain
// static ./dist directory for GitHub Pages.
//
// This directory is the source of truth for the published game: client
// source plus the localStorage layer in src/api.ts (no backend, no login).
// `bun run build` compiles ./dist and then refreshes ../docs, which is what
// GitHub Pages serves.

import { cp, mkdir, rm } from "node:fs/promises";
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

// Runtime content packs live in ./public and are fetched as plain JSON by
// the content loader (with last-known-good cache + bundled fallback), so
// new words ship as data. Copy them into dist before the docs sync.
const PUBLIC = new URL("./public/", import.meta.url);
await cp(PUBLIC, new URL("./dist/", import.meta.url), { recursive: true });
console.log("copied ./public OK");

// Publish step: refresh the GitHub Pages output that lives next to this
// source tree, so one command rebuilds the live site.
const DOCS = new URL("../docs/", import.meta.url);
await rm(DOCS, { recursive: true, force: true });
await mkdir(DOCS, { recursive: true });
await cp(new URL("./dist/", import.meta.url), DOCS, { recursive: true });
console.log("synced ../docs OK");
