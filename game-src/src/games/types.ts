import type { GameState, Vowel } from "../api";
import type { Letter } from "../draw-classifier";

/** What the arcade shell hands every game. */
export type GameContext = {
  state: GameState;
  coins: number;
  onBack: () => void;
  onOpenShop: () => void;
  /**
   * Record one scored event for this game (+reward / −penalty coins).
   * `detail` is per-item tracking: `{ word, vowel }` for vowel games so
   * misses are tracked per word, `{ problem }` (e.g. "7 + 8") for Math
   * Blasters so misses are tracked per problem. Games without item-level
   * tracking omit it.
   */
  onRecord: (correct: boolean, detail?: { word: string; vowel: Vowel } | { problem: string }) => Promise<void>;
  /**
   * Award bonus coins outside the per-answer reward/penalty flow
   * (Math Blasters: +100 for a 20-answer flawless streak).
   */
  awardBonus: (coins: number) => Promise<void>;
  /** Bed game only: letter attempts need their target letter. */
  recordLetter: (target: Letter, correct: boolean) => Promise<void>;
  /** Bed game only: the scoreboard's grown-up reset lives in its view. */
  onReset: () => void;
  resetting: boolean;
  /** Sound Blaster / Math Blasters: true when started from the missed-items "Focus these" button. */
  focusMissed?: boolean;
};

/** Round outcome shown by the practice games. */
export type Verdict = "correct" | "wrong" | "retry" | null;
