import type { ReactNode } from "react";
import type { GameState } from "../api";
import { practiceStat, SOUND_SORT_WORDS } from "../content/word-bank";
import type { GameContext } from "./types";
import { BedGame } from "./bed";
import { SoundSortGame } from "./sound-sort";
import { PairPickerGame } from "./pair-picker";
import { WriteItGame } from "./write-it";
import { MathBlastersGame } from "./math-blasters";
import { OddOneOutGame } from "./odd-one-out";

export type TileKind = "hero" | "grid" | "wide";

export type GameDef = {
  /** Stable id: also the practice-stats key and the view name. */
  id: string;
  tile: TileKind;
  /** Tile copy. */
  name: ReactNode;
  tagline: ReactNode;
  rule: ReactNode;
  art: ReactNode;
  tileClass: string;
  artClass?: string;
  playLabel: string;
  /** Small note under a grid tile's name. */
  note?: ReactNode;
  /** e.g. "12/20 right" — shown when the player has attempts. */
  statLine?: (state: GameState) => string | undefined;
  render: (ctx: GameContext) => ReactNode;
};

function practiceStatLine(gameId: string) {
  return (state: GameState) => {
    const stat = practiceStat(state, gameId);
    return stat && stat.attempts > 0 ? `${stat.correct}/${stat.attempts} right` : undefined;
  };
}

/**
 * The arcade's game list. Adding a game = one entry here (plus its module).
 * Menu, routing, stats, and the API's stat rows all derive from this —
 * no other file needs a game id.
 */
export const GAMES: GameDef[] = [
  {
    id: "bed",
    tile: "hero",
    name: "b__d",
    tagline: "Say it like “bed”",
    rule: <><b>b</b> sound at the beginning, <b>d</b> at the end.</>,
    art: <span className="bed-word" aria-hidden="true"><b>b</b><i>__</i><b>d</b></span>,
    tileClass: "bed-game-tile",
    playLabel: "Play the b d game, bed",
    render: (ctx) => <BedGame {...ctx} />,
  },
  {
    id: "sound-sort",
    tile: "grid",
    name: "o or u?",
    tagline: "",
    rule: "Which short vowel is in the middle?",
    art: "ŏ  ŭ",
    tileClass: "vowel-tile",
    playLabel: "Play O or U",
    note: `${SOUND_SORT_WORDS.length} short-vowel words in the mix.`,
    statLine: practiceStatLine("sound-sort"),
    render: (ctx) => <SoundSortGame {...ctx} />,
  },
  {
    id: "pair-picker",
    tile: "grid",
    name: "Pair picker",
    tagline: "",
    rule: "Which one did you hear?",
    art: "cot · cut",
    tileClass: "pair-tile",
    playLabel: "Play Pair Picker",
    note: "Listen closely, then sort the word.",
    statLine: practiceStatLine("pair-picker"),
    render: (ctx) => <PairPickerGame {...ctx} />,
  },
  {
    id: "write-it",
    tile: "grid",
    name: "Write it",
    tagline: "",
    rule: "Build the word, mark the vowel.",
    art: "mŭck",
    tileClass: "write-tile",
    playLabel: "Play Write It",
    note: "Build the word and mark the vowel.",
    statLine: practiceStatLine("write-it"),
    render: (ctx) => <WriteItGame {...ctx} />,
  },
  {
    id: "math-blasters",
    tile: "wide",
    name: "Math Blasters",
    tagline: "Blast the answer!",
    rule: "Click the falling number before it reaches your ship.",
    art: "✦ 3 + 2 ✦",
    artClass: "math-tile-art",
    tileClass: "math-game-tile",
    playLabel: "Play Math Blasters",
    statLine: practiceStatLine("math-blasters"),
    render: (ctx) => <MathBlastersGame {...ctx} />,
  },
  {
    id: "odd-one-out",
    tile: "wide",
    name: "Odd One Out",
    tagline: "Bonk the odd word!",
    rule: "Three words share a vowel — bonk the one that doesn't.",
    art: "✦ cot · cut · cot ✦",
    artClass: "math-tile-art",
    tileClass: "math-game-tile",
    playLabel: "Play Odd One Out",
    statLine: practiceStatLine("odd-one-out"),
    render: (ctx) => <OddOneOutGame {...ctx} />,
  },
];

/** Game ids that earn practice stats (everything but the bed drawing game). */
export const PRACTICE_GAME_IDS: string[] = GAMES.filter((game) => game.id !== "bed").map((game) => game.id);

export function getGame(id: string): GameDef | undefined {
  return GAMES.find((game) => game.id === id);
}
