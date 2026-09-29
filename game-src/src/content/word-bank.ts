import { VOWEL_AUDIO } from "../assets/vowels";
import type { GameState } from "../api";
import type { PracticeGameId } from "../api";

export type Vowel = "o" | "u";
export type PracticeWord = { word: string; vowel: Vowel; vowelIndex: number; audio: string };

export const SHORT_O_WORDS = [
  "cot", "cop", "cob", "cod", "bog", "dog", "hog", "lock", "dock", "sock", "mock", "pop",
  "not", "rot", "shot", "fond", "hot", "hop", "pot", "top", "mop", "rock", "box", "fox",
  "dot", "log", "rod", "pond", "drop", "shop", "stop", "clock", "block", "flock", "shock", "stock", "trot", "stomp", "chomp",
] as const;
export const SHORT_U_WORDS = [
  "cut", "cup", "cub", "cud", "bug", "dug", "hug", "luck", "duck", "suck", "muck", "pup",
  "nut", "rut", "shut", "fund", "hut", "hum", "hub", "pug", "puck", "tub", "tug", "tuck",
  "mug", "stuck", "truck", "cluck", "buck", "bus", "bud", "run", "rug", "rub", "sun",
  "fun", "gun", "drum", "plum", "plug", "club", "scrub", "slug", "blush", "brush", "crush", "trust", "trunk", "up",
] as const;
export const PRACTICE_WORDS: PracticeWord[] = [
  ...SHORT_O_WORDS.map((word) => ({ word, vowel: "o" as const, vowelIndex: word.indexOf("o"), audio: VOWEL_AUDIO[word] })),
  ...SHORT_U_WORDS.map((word) => ({ word, vowel: "u" as const, vowelIndex: word.indexOf("u"), audio: VOWEL_AUDIO[word] })),
];
// "up" has no middle vowel, so it doesn't fit sound-sort's "which vowel is in
// the middle?" prompt. It stays in the other games' pools.
export const SOUND_SORT_WORDS = PRACTICE_WORDS.filter((item) => item.word !== "up");
export const WRITE_WORDS = PRACTICE_WORDS.filter((item) => item.word.length <= 4);
export const WORD_AUDIO = new Map(PRACTICE_WORDS.map((item) => [item.word, item.audio]));
export const PAIRS = [
  ["cot", "cut"], ["cop", "cup"], ["cob", "cub"], ["cod", "cud"], ["bog", "bug"],
  ["dog", "dug"], ["hog", "hug"], ["lock", "luck"], ["dock", "duck"], ["sock", "suck"],
  ["mock", "muck"], ["pop", "pup"], ["not", "nut"], ["rot", "rut"], ["shot", "shut"], ["fond", "fund"],
] as const;
export const DEFAULT_PAIR: readonly [string, string] = ["cot", "cut"];
export const DEFAULT_WORD: PracticeWord = { word: "cot", vowel: "o", vowelIndex: 1, audio: VOWEL_AUDIO.cot };

export function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

export function practiceStat(state: GameState | undefined, gameId: PracticeGameId) {
  return state?.practiceStats.find((item) => item.gameId === gameId);
}
