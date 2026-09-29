import type { GameState } from "../api";
import type { Letter } from "../draw-classifier";

/** What the arcade shell hands every game. */
export type GameContext = {
  state: GameState;
  coins: number;
  onBack: () => void;
  onOpenShop: () => void;
  /** Record one scored event for this game (+reward / −penalty coins). */
  onRecord: (correct: boolean) => Promise<void>;
  /** Bed game only: letter attempts need their target letter. */
  recordLetter: (target: Letter, correct: boolean) => Promise<void>;
  /** Bed game only: the scoreboard's grown-up reset lives in its view. */
  onReset: () => void;
  resetting: boolean;
};

/** Round outcome shown by the practice games. */
export type Verdict = "correct" | "wrong" | "retry" | null;
