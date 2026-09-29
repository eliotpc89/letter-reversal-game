// Loads content packs at runtime: live JSON first, validated; then the
// last-known-good copy in localStorage; then the copy bundled at build
// time. The arcade always starts, even offline or with a broken deploy.

import fallbackManifestJson from "../../public/content/manifest.json";
import fallbackPhonicsJson from "../../public/content/packs/phonics-core.json";
import fallbackOddJson from "../../public/content/packs/odd-one-out.json";
import type { ContentManifest, PackId, PackMap } from "./packs";
import { validateManifest, validatePack } from "./validate";

const CACHE_KEY = "arcade-content/v1";

export type ContentBundle = {
  /** Where this bundle came from — useful for a grown-up debug hint. */
  source: "live" | "cache" | "fallback";
  manifest: ContentManifest;
  packs: PackMap;
};

const FALLBACK_BUNDLE: ContentBundle = {
  source: "fallback",
  manifest: fallbackManifestJson as ContentManifest,
  packs: {
    "phonics-core": fallbackPhonicsJson as PackMap["phonics-core"],
    "odd-one-out": fallbackOddJson as PackMap["odd-one-out"],
  },
};

function readCache(): { version: number; packs: PackMap } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; packs?: unknown };
    if (typeof parsed.version !== "number" || typeof parsed.packs !== "object" || parsed.packs === null) return null;
    const packs = parsed.packs as Partial<PackMap>;
    if (!packs["phonics-core"] || !packs["odd-one-out"]) return null;
    return { version: parsed.version, packs: packs as PackMap };
  } catch {
    return null;
  }
}

function writeCache(version: number, packs: PackMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version, packs }));
  } catch {
    // Storage full or unavailable — the live bundle still works for this session.
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`content fetch failed: ${path} (${response.status})`);
  return response.json() as Promise<unknown>;
}

function packsValid(manifest: ContentManifest, packs: Partial<PackMap>): packs is PackMap {
  return manifest.packs.every((entry) => {
    const id = entry.id as PackId;
    const pack = (packs as Partial<Record<PackId, unknown>>)[id];
    return pack !== undefined && validatePack(id, pack).length === 0;
  });
}

/** The copy bundled at build time — always available, synchronously. */
export function getFallbackBundle(): ContentBundle {
  return FALLBACK_BUNDLE;
}

export async function loadContent(): Promise<ContentBundle> {  // 1. Live packs from the deployed site.
  try {
    const manifest = (await fetchJson("content/manifest.json")) as ContentManifest;
    if (validateManifest(manifest).length > 0) throw new Error("manifest failed validation");
    const cached = readCache();
    if (cached && cached.version === manifest.version && packsValid(manifest, cached.packs)) {
      return { source: "cache", manifest, packs: cached.packs };
    }
    const packs = {} as Partial<PackMap>;
    for (const entry of manifest.packs) {
      const id = entry.id as PackId;
      const pack = await fetchJson(`content/packs/${entry.file}`);
      if (validatePack(id, pack).length > 0) throw new Error(`pack "${id}" failed validation`);
      (packs as Partial<Record<PackId, unknown>>)[id] = pack;
    }
    if (!packsValid(manifest, packs)) throw new Error("live packs incomplete");
    writeCache(manifest.version, packs);
    return { source: "live", manifest, packs };
  } catch {
    // 2. Last-known-good copy, any version.
    const cached = readCache();
    if (cached) {
      const manifest = FALLBACK_BUNDLE.manifest;
      if (packsValid(manifest, cached.packs)) return { source: "cache", manifest, packs: cached.packs };
    }
    // 3. Bundled at build time — always valid.
    return FALLBACK_BUNDLE;
  }
}
