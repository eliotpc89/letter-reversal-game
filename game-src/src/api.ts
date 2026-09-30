// Local persistence layer for the GitHub Pages build.
//
// Same action surface the hosted arcade exposes through its server actions,
// but the game state lives in the browser's localStorage instead of SQLite,
// so coins, trophies, and scores persist on the device with no login and no
// backend. All functions are async to match the original RPC signatures.

// Practice-stat game ids live in the leaf ids module (no import cycle:
// the component registry depends on it too).
import { PRACTICE_GAME_IDS } from "./games/ids";
// Trophy artwork and catalog live in data files under platform/ so new
// trophies are a JSON row + an SVG string — no code edits to prices.
import { TROPHY_ICONS } from "./platform/trophy-icons";
import trophyCatalogJson from "./platform/trophy-catalog.json";

export type Letter = "b" | "d" | "p" | "q" | "n" | "u" | "c" | "k";
/** Every trophy id with artwork in trophy-icons.ts. */
export type TrophyId = keyof typeof TROPHY_ICONS;
export type PracticeGameId = string;
export type Vowel = "o" | "u";

const LETTERS: Letter[] = ["b", "d", "p", "q", "n", "u", "c", "k"];
const PRACTICE_GAMES: PracticeGameId[] = PRACTICE_GAME_IDS;
/** Prices come from trophy-catalog.json; ids stay valid via the TrophyId union. */
const TROPHY_PRICES: Record<TrophyId, number> = Object.fromEntries(
  (trophyCatalogJson as { id: TrophyId; price: number }[]).map((row) => [row.id, row.price]),
) as Record<TrophyId, number>;

export interface TrackedLetter {
  letter: Letter;
  attempts: number;
  correct: number;
}

export interface PracticeStat {
  gameId: PracticeGameId;
  attempts: number;
  correct: number;
}

export interface WordStat {
  word: string;
  vowel: Vowel;
  attempts: number;
  correct: number;
  misses: number;
}

export interface MathStat {
  /** e.g. "7 + 8" or "12 \u2212 4" */
  problem: string;
  attempts: number;
  correct: number;
  misses: number;
}

export interface GameState {
  coins: number;
  totalEarned: number;
  totalLost: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  letters: TrackedLetter[];
  practiceStats: PracticeStat[];
  wordStats: WordStat[];
  mathStats: MathStat[];
  unlockedTrophies: TrophyId[];
}

export type ApiResponse<TApi, TAction extends keyof TApi> = TApi[TAction] extends (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Promise<infer R>
  ? R
  : never;

const STORAGE_KEY = "letter-reversal-game:v1";

function defaultState(): GameState {
  return {
    coins: 10,
    totalEarned: 0,
    totalLost: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    letters: LETTERS.map((letter) => ({ letter, attempts: 0, correct: 0 })),
    practiceStats: PRACTICE_GAMES.map((gameId) => ({ gameId, attempts: 0, correct: 0 })),
    wordStats: [],
    mathStats: [],
    unlockedTrophies: [],
  };
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.coins === "number" &&
    Array.isArray(v.letters) &&
    Array.isArray(v.practiceStats) &&
    Array.isArray(v.unlockedTrophies)
  );
}

function sanitizeState(parsed: unknown): GameState | null {
  if (!isGameState(parsed)) return null;
  // Rebuild through the default shape so older saved states pick up any
  // new fields, and every call gets fresh objects (no shared references).
  const fresh = defaultState();
  const byLetter = new Map(
    parsed.letters.map((row: TrackedLetter) => [row.letter, row]),
  );
  const byGame = new Map(
    parsed.practiceStats.map((row: PracticeStat) => [row.gameId, row]),
  );
  const wordStats = Array.isArray(parsed.wordStats)
    ? parsed.wordStats.flatMap((row: WordStat) => {
        if (typeof row?.word !== "string" || !/^[a-z]+$/.test(row.word) || (row.vowel !== "o" && row.vowel !== "u")) return [];
        return [{
          word: row.word,
          vowel: row.vowel,
          attempts: typeof row.attempts === "number" ? Math.max(0, row.attempts) : 0,
          correct: typeof row.correct === "number" ? Math.max(0, row.correct) : 0,
          misses: typeof row.misses === "number" ? Math.max(0, row.misses) : 0,
        }];
      })
    : [];
  return {
    ...fresh,
    ...parsed,
    letters: fresh.letters.map((row) => {
      const saved = byLetter.get(row.letter);
      return {
        letter: row.letter,
        attempts: typeof saved?.attempts === "number" ? saved.attempts : 0,
        correct: typeof saved?.correct === "number" ? saved.correct : 0,
      };
    }),
    practiceStats: fresh.practiceStats.map((row) => {
      const saved = byGame.get(row.gameId);
      return {
        gameId: row.gameId,
        attempts: typeof saved?.attempts === "number" ? saved.attempts : 0,
        correct: typeof saved?.correct === "number" ? saved.correct : 0,
      };
    }),
    wordStats,
    mathStats: Array.isArray(parsed.mathStats)
      ? parsed.mathStats.flatMap((row: MathStat) => {
          if (typeof row?.problem !== "string" || !/^\d+ [+\u2212] \d+$/.test(row.problem)) return [];
          return [{
            problem: row.problem,
            attempts: typeof row.attempts === "number" ? Math.max(0, row.attempts) : 0,
            correct: typeof row.correct === "number" ? Math.max(0, row.correct) : 0,
            misses: typeof row.misses === "number" ? Math.max(0, row.misses) : 0,
          }];
        })
      : [],
    unlockedTrophies: parsed.unlockedTrophies.filter(
      (id): id is TrophyId => typeof id === "string" && id in TROPHY_PRICES,
    ),
  };
}

function loadState(): GameState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeState(JSON.parse(raw)) ?? defaultState();
  } catch {
    return defaultState();
  }
}

function toBase64Url(json: string): string {
  const binary = unescape(encodeURIComponent(json));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  let s = code.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return decodeURIComponent(escape(atob(s)));
}

export type SharedProgress = Pick<GameState, "coins" | "unlockedTrophies">;

/** Serialize only coins and trophies into a short URL-safe transfer code. */
export function encodeSave(state: GameState): string {
  return toBase64Url(JSON.stringify({
    version: 2,
    coins: Math.max(0, Math.floor(state.coins)),
    unlockedTrophies: [...new Set(state.unlockedTrophies)],
  }));
}

/** Parse a coins-and-trophies transfer code; returns null when invalid. */
export function decodeSave(code: string): SharedProgress | null {
  try {
    const parsed = JSON.parse(fromBase64Url(code)) as Record<string, unknown>;
    if (typeof parsed.coins !== "number" || !Array.isArray(parsed.unlockedTrophies)) return null;
    const unlockedTrophies = parsed.unlockedTrophies.filter(
      (id): id is TrophyId => typeof id === "string" && id in TROPHY_PRICES,
    );
    return {
      coins: Math.max(0, Math.floor(parsed.coins)),
      unlockedTrophies: [...new Set(unlockedTrophies)],
    };
  } catch {
    return null;
  }
}

function saveState(state: GameState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (e.g. private mode): the game still works
    // for the session, it just won't persist.
  }
}

async function recordAttemptInner(
  kind: "letter" | "practice",
  id: Letter | PracticeGameId,
  correct: boolean,
  word?: { word: string; vowel: Vowel },
  problem?: string,
): Promise<{ coinsChanged: number; state: GameState }> {
  const before = loadState();
  const reward = kind === "letter" ? 5 : 3;
  const penalty = kind === "letter" ? 3 : 1;
  const coinsChanged = correct ? reward : -Math.min(penalty, before.coins);
  const nextStreak = correct ? before.streak + 1 : 0;
  const next: GameState = {
    ...before,
    coins: before.coins + coinsChanged,
    totalEarned: before.totalEarned + (correct ? reward : 0),
    totalLost: before.totalLost + (correct ? 0 : -coinsChanged),
    wins: before.wins + (correct ? 1 : 0),
    losses: before.losses + (correct ? 0 : 1),
    streak: nextStreak,
    bestStreak: Math.max(before.bestStreak, nextStreak),
    letters:
      kind === "letter"
        ? before.letters.map((row) =>
            row.letter === id
              ? {
                  ...row,
                  attempts: row.attempts + 1,
                  correct: row.correct + (correct ? 1 : 0),
                }
              : row,
          )
        : before.letters,
    practiceStats:
      kind === "practice"
        ? before.practiceStats.map((row) =>
            row.gameId === id
              ? {
                  ...row,
                  attempts: row.attempts + 1,
                  correct: row.correct + (correct ? 1 : 0),
                }
              : row,
          )
        : before.practiceStats,
    wordStats: word
      ? (() => {
          const existing = before.wordStats.find((row) => row.word === word.word);
          const nextRow: WordStat = existing
            ? { ...existing, attempts: existing.attempts + 1, correct: existing.correct + (correct ? 1 : 0), misses: existing.misses + (correct ? 0 : 1) }
            : { word: word.word, vowel: word.vowel, attempts: 1, correct: correct ? 1 : 0, misses: correct ? 0 : 1 };
          return existing ? before.wordStats.map((row) => row.word === word.word ? nextRow : row) : [...before.wordStats, nextRow];
        })()
      : before.wordStats,
    mathStats: problem && /^\d+ [+\u2212] \d+$/.test(problem)
      ? (() => {
          const existing = before.mathStats.find((row) => row.problem === problem);
          const nextRow: MathStat = existing
            ? { ...existing, attempts: existing.attempts + 1, correct: existing.correct + (correct ? 1 : 0), misses: existing.misses + (correct ? 0 : 1) }
            : { problem, attempts: 1, correct: correct ? 1 : 0, misses: correct ? 0 : 1 };
          return existing ? before.mathStats.map((row) => row.problem === problem ? nextRow : row) : [...before.mathStats, nextRow];
        })()
      : before.mathStats,
  };
  saveState(next);
  return { coinsChanged, state: next };
}

export const api = {
  async getGameState(_args: Record<string, never>): Promise<GameState> {
    return loadState();
  },

  async recordAttempt(args: { target: Letter; correct: boolean }): Promise<{
    coinsChanged: number;
    state: GameState;
  }> {
    return recordAttemptInner("letter", args.target, args.correct);
  },

  async recordPracticeAttempt(args: {
    gameId: PracticeGameId;
    correct: boolean;
    word?: { word: string; vowel: Vowel };
    problem?: string;
  }): Promise<{ coinsChanged: number; state: GameState }> {
    return recordAttemptInner("practice", args.gameId, args.correct, args.word, args.problem);
  },

  async unlockTrophy(args: { trophyId: TrophyId }): Promise<{
    status: "unlocked" | "already-owned" | "not-enough-coins";
    state: GameState;
  }> {
    const before = loadState();
    if (before.unlockedTrophies.includes(args.trophyId)) {
      return { status: "already-owned", state: before };
    }
    const price = TROPHY_PRICES[args.trophyId];
    if (before.coins < price) {
      return { status: "not-enough-coins", state: before };
    }
    const next: GameState = {
      ...before,
      coins: before.coins - price,
      unlockedTrophies: [...before.unlockedTrophies, args.trophyId],
    };
    saveState(next);
    return { status: "unlocked", state: next };
  },

  async resetProgress(_args: { confirm: true }): Promise<GameState> {
    const next = defaultState();
    saveState(next);
    return next;
  },

  async resetMissedWords(_args: Record<string, never>): Promise<GameState> {
    const before = loadState();
    const next = { ...before, wordStats: [] };
    saveState(next);
    return next;
  },

  async resetMissedNumbers(_args: Record<string, never>): Promise<GameState> {
    const before = loadState();
    const next = { ...before, mathStats: [] };
    saveState(next);
    return next;
  },

  async importSave(args: { code: string }): Promise<{
    ok: boolean;
    state: GameState;
  }> {
    const imported = decodeSave(args.code);
    if (!imported) return { ok: false, state: loadState() };
    const next = { ...loadState(), ...imported };
    saveState(next);
    return { ok: true, state: next };
  },
};
