import { VOWEL_AUDIO } from "../assets/vowels";

const VOWEL_CLIPS = VOWEL_AUDIO as Record<string, string>;
import type { GameState } from "../api";
import type { PracticeGameId } from "../api";
import type { PhonicsCorePack } from "./packs";

export type Vowel = "o" | "u";
export type PracticeWord = { word: string; vowel: Vowel; vowelIndex: number; audio: string };

/** Everything the games derive from the phonics-core pack. */
export type WordBank = {
  SHORT_O_WORDS: readonly string[];
  SHORT_U_WORDS: readonly string[];
  PRACTICE_WORDS: PracticeWord[];
  /** "up" has no middle vowel, so it doesn't fit sound-sort's prompt. */
  SOUND_SORT_WORDS: PracticeWord[];
  WRITE_WORDS: PracticeWord[];
  WORD_AUDIO: Map<string, string>;
  PAIRS: readonly (readonly [string, string])[];
  DEFAULT_PAIR: readonly [string, string];
  DEFAULT_WORD: PracticeWord;
};

function toPracticeWord(word: string, vowel: Vowel): PracticeWord {
  return { word, vowel, vowelIndex: word.indexOf(vowel), audio: VOWEL_CLIPS[word] };
}

/**
 * Build the derived word lists from a phonics-core pack. Derivation rules
 * live here, in code, so every pack gets the same treatment: vowel indexes,
 * the "up" exclusion for sound-sort, the four-letter cap for write-it.
 */
export function buildWordBank(pack: PhonicsCorePack): WordBank {
  const oWords = pack.shortO.map((word) => toPracticeWord(word, "o"));
  const uWords = pack.shortU.map((word) => toPracticeWord(word, "u"));
  const practice = [...oWords, ...uWords];
  const soundSort = practice.filter((item) => item.word !== "up");
  const first = oWords[0];
  return {
    SHORT_O_WORDS: pack.shortO,
    SHORT_U_WORDS: pack.shortU,
    PRACTICE_WORDS: practice,
    SOUND_SORT_WORDS: soundSort,
    WRITE_WORDS: practice.filter((item) => item.word.length <= 4),
    WORD_AUDIO: new Map(practice.map((item) => [item.word, item.audio])),
    PAIRS: pack.pairs,
    DEFAULT_PAIR: pack.pairs[0] ?? (["cot", "cut"] as const),
    DEFAULT_WORD: first ?? { word: "cot", vowel: "o", vowelIndex: 1, audio: VOWEL_CLIPS["cot"] },
  };
}

export function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

export function practiceStat(state: GameState | undefined, gameId: PracticeGameId) {
  return state?.practiceStats.find((item) => item.gameId === gameId);
}
