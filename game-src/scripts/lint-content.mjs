// Content linter: validates public/content packs the same way the browser
// loader does, then checks the word↔audio coverage so a data-only change
// can't ship a word with no sound (or a sound with no word).
//
// Run: bun scripts/lint-content.mjs   (add it to CI alongside the build)

import { readdir } from "node:fs/promises";
import { validateManifest, validatePack } from "../src/content/validate.ts";

let failures = 0;
const fail = (message) => { failures += 1; console.error(`content lint: ${message}`); };

const manifest = await Bun.file("./public/content/manifest.json").json();
for (const error of validateManifest(manifest)) fail(`manifest: ${error}`);

const packs = {};
for (const entry of manifest.packs ?? []) {
  let pack;
  try {
    pack = await Bun.file(`./public/content/packs/${entry.file}`).json();
  } catch {
    fail(`pack "${entry.id}": missing file public/content/packs/${entry.file}`);
    continue;
  }
  for (const error of validatePack(entry.id, pack)) fail(`pack "${entry.id}": ${error}`);
  packs[entry.id] = pack;
}

// Word↔audio coverage: every pool word needs a clip, and every clip
// should be reachable from some pool (so generated audio never orphans).
const wordSets = [];
const phonics = packs["phonics-core"];
if (phonics) wordSets.push([...phonics.shortO, ...phonics.shortU]);
const trick = packs["trick-words"];
if (trick) wordSets.push(trick.packs.flatMap((pack) => pack.words));
const bonus = packs["bonus-words"];
if (bonus) wordSets.push(bonus.pairs.map(([word]) => word));
const words = new Set(wordSets.flat());
if (words.size > 0) {
  const clipFiles = await readdir("./public/content/audio");
  const clips = new Set(
    clipFiles.filter((file) => file.endsWith(".mp3")).map((file) => file.slice(0, -4)),
  );
  for (const word of words) {
    if (!clips.has(word)) fail(`word "${word}" has no clip in public/content/audio`);
  }
  for (const clip of clips) {
    if (!words.has(clip)) fail(`clip "${clip}.mp3" is not in any word pool`);
  }
  console.log(`content lint: checked ${words.size} words against ${clips.size} clips`);
}

if (failures > 0) {
  console.error(`content lint: ${failures} problem(s)`);
  process.exit(1);
}
console.log("content lint: OK");
