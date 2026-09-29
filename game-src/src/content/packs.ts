// Runtime content-pack shapes. These live in public/content/ as JSON so a
// new word list ships as data, never as code.

export type ManifestEntry = { id: string; file: string; version: number };
export type ContentManifest = { version: number; packs: ManifestEntry[] };

export type PhonicsCorePack = {
  id: "phonics-core";
  version: number;
  shortO: string[];
  shortU: string[];
  /** Minimal-pair rows: [short-o word, short-u word]. */
  pairs: [string, string][];
};

export type OddRound = { matchPool: "short-o" | "short-u"; oddPool: "short-o" | "short-u" };
export type OddOneOutPack = {
  id: "odd-one-out";
  version: number;
  rounds: OddRound[];
};

export type PackMap = {
  "phonics-core": PhonicsCorePack;
  "odd-one-out": OddOneOutPack;
};
export type PackId = keyof PackMap;
