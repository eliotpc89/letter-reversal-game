// Validation for runtime content packs. Same rules run in the browser
// (loader) and in the build-time linter (scripts/lint-content.mjs), so a
// bad pack can never take down the arcade — it just doesn't load.

import type { ContentManifest, OddRound, PackId, PhonicsCorePack } from "./packs";

const POOLS = ["short-o", "short-u"] as const;
const WORD = /^[a-z]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["manifest is not an object"];
  if (typeof value.version !== "number") errors.push("manifest.version must be a number");
  if (!Array.isArray(value.packs)) return [...errors, "manifest.packs must be an array"];
  const seen = new Set<string>();
  value.packs.forEach((entry, index) => {
    if (!isRecord(entry)) { errors.push(`manifest.packs[${index}] is not an object`); return; }
    if (typeof entry.id !== "string" || !entry.id) errors.push(`manifest.packs[${index}].id must be a non-empty string`);
    else if (seen.has(entry.id)) errors.push(`manifest.packs[${index}].id "${entry.id}" is duplicated`);
    else seen.add(entry.id);
    if (typeof entry.file !== "string" || !entry.file.endsWith(".json")) errors.push(`manifest.packs[${index}].file must be a .json path`);
    if (typeof entry.version !== "number") errors.push(`manifest.packs[${index}].version must be a number`);
  });
  return errors;
}

export function validatePhonicsCore(pack: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(pack)) return ["phonics-core pack is not an object"];
  const list = (key: string) => {
    const value = pack[key];
    if (!Array.isArray(value) || value.length === 0) { errors.push(`phonics-core.${key} must be a non-empty array`); return [] as string[]; }
    const words = value.filter((word): word is string => typeof word === "string");
    if (words.length !== value.length) errors.push(`phonics-core.${key} must contain only strings`);
    words.forEach((word) => { if (!WORD.test(word)) errors.push(`phonics-core.${key} has non-lowercase-alpha word "${word}"`); });
    const dupes = words.filter((word, i) => words.indexOf(word) !== i);
    if (dupes.length) errors.push(`phonics-core.${key} has duplicates: ${[...new Set(dupes)].join(", ")}`);
    return words;
  };
  const shortO = list("shortO");
  const shortU = list("shortU");
  const overlap = shortO.filter((word) => shortU.includes(word));
  if (overlap.length) errors.push(`words appear in both pools: ${overlap.join(", ")}`);
  const oSet = new Set(shortO);
  const uSet = new Set(shortU);
  if (!Array.isArray(pack.pairs) || pack.pairs.length === 0) errors.push("phonics-core.pairs must be a non-empty array");
  else (pack.pairs as unknown[]).forEach((pair, index) => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") {
      errors.push(`phonics-core.pairs[${index}] must be [short-o word, short-u word]`); return;
    }
    if (!oSet.has(pair[0])) errors.push(`phonics-core.pairs[${index}][0] "${pair[0]}" is not in shortO`);
    if (!uSet.has(pair[1])) errors.push(`phonics-core.pairs[${index}][1] "${pair[1]}" is not in shortU`);
  });
  return errors;
}

export function validateOddOneOut(pack: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(pack)) return ["odd-one-out pack is not an object"];
  if (!Array.isArray(pack.rounds) || pack.rounds.length === 0) return [...errors, "odd-one-out.rounds must be a non-empty array"];
  (pack.rounds as unknown[]).forEach((round, index) => {
    if (!isRecord(round)) { errors.push(`odd-one-out.rounds[${index}] is not an object`); return; }
    const asRound = round as unknown as OddRound;
    if (!POOLS.includes(asRound.matchPool)) errors.push(`odd-one-out.rounds[${index}].matchPool must be "short-o" or "short-u"`);
    if (!POOLS.includes(asRound.oddPool)) errors.push(`odd-one-out.rounds[${index}].oddPool must be "short-o" or "short-u"`);
    if (asRound.matchPool === asRound.oddPool) errors.push(`odd-one-out.rounds[${index}] needs different match and odd pools`);
  });
  return errors;
}

export function validatePack(id: PackId, pack: unknown): string[] {
  if (id === "phonics-core") return validatePhonicsCore(pack);
  if (id === "odd-one-out") return validateOddOneOut(pack);
  return [`unknown pack id "${id}"`];
}
