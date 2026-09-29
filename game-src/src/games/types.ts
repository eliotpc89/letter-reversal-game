import type { GameState } from "../api";

/** What the arcade shell hands every game. */
export type GameContext = {
  state: GameState;
  coins: number;
  onBack: () => void;
  onOpenShop: () => void;
  /** Record one scored event: +reward coins when true, −penalty when false. */
  onRecord: (correct: boolean) => Promise<void>;
};
