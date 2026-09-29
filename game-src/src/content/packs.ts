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

/** Trick words are tested in listed order. */
export type TrickWordsPack = {
  id: "trick-words";
  version: number;
  words: string[];
};

/** Bonus-letter pairs: [correct spelling, decoy missing the bonus letter]. */
export type BonusWordsPack = {
  id: "bonus-words";
  version: number;
  pairs: [string, string][];
};

export type MathOperator = "+" | "−";
/**
 * One selectable problem set. Problems are generated from the params, so a
 * new set is one JSON entry:
 * - "+": every x + operand with x in 0..(max - operand) (max is the top answer)
 * - "−": every x − operand with x in operand..max (max is the top minuend)
 */
export type MathSet = {
  id: string;
  label: string;
  operator: MathOperator;
  operand: number;
  max: number;
};
export type MathBlasterPack = {
  id: "math-blaster";
  version: number;
  sets: MathSet[];
};

export type PackMap = {
  "phonics-core": PhonicsCorePack;
  "odd-one-out": OddOneOutPack;
  "trick-words": TrickWordsPack;
  "bonus-words": BonusWordsPack;
  "math-blaster": MathBlasterPack;
};
export type PackId = keyof PackMap;
