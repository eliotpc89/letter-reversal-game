import { useCallback } from "react";
import { FallingTapper, type TapTarget, type Wave } from "../engines/FallingTapper";
import { SHORT_O_WORDS, SHORT_U_WORDS, shuffled } from "../content/word-bank";
import type { GameContext } from "./types";

/**
 * Odd One Out on the FallingTapper engine.
 *
 * Three falling words share a short vowel, one doesn't — bonk the odd one.
 * Content is pure data (two word pools); the mechanic is 100% engine.
 *
 * NOTE (step 5): move ODD_POOLS into content JSON (packs/odd-one-out.json).
 */
const ODD_POOLS = [
  { match: [...SHORT_O_WORDS], odd: [...SHORT_U_WORDS] },
  { match: [...SHORT_U_WORDS], odd: [...SHORT_O_WORDS] },
] as const;

function pick<T>(pool: readonly T[], count: number, exclude: Set<string>): T[] {
  const chosen: T[] = [];
  for (const item of shuffled(pool)) {
    if (chosen.length >= count) break;
    const key = String(item);
    if (!exclude.has(key)) {
      exclude.add(key);
      chosen.push(item);
    }
  }
  return chosen;
}

function makeOddWave(round: number): Wave {
  const pool = ODD_POOLS[round % ODD_POOLS.length] ?? ODD_POOLS[0]!;
  const seen = new Set<string>();
  const matchWords = pick(pool.match, 3, seen);
  const [oddWord] = pick(pool.odd, 1, seen);
  const targets: TapTarget[] = shuffled([
    ...matchWords.map((word, index) => ({ key: `m${round}-${index}`, label: word, good: false })),
    { key: `odd-${round}`, label: oddWord ?? "up", good: true },
  ]);
  return {
    prompt: "Bonk the word with the different vowel!",
    targets,
  };
}

export function OddOneOutGame({ coins, onBack, onOpenShop, onRecord }: GameContext) {
  const makeWave = useCallback((round: number): Wave => makeOddWave(round), []);

  const wrongFeedback = useCallback(
    (_wave: Wave, target: TapTarget) =>
      `"${target.label}" has the same vowel as the others — find the odd one out!`,
    [],
  );

  return <FallingTapper
    shell={{ variant: "math", eyebrow: "Odd One Out", title: "Bonk it!", coins, onBack, onOpenShop, fullscreenClass: "math-fullscreen" }}
    promptKicker="Word hunt!"
    introFeedback="Bonk the word with the different vowel before it escapes!"
    nextWaveFeedback="Find the odd one out!"
    hitFeedback="ODD ONE BONKED! Nice eyes!"
    wrongFeedback={wrongFeedback}
    breachFeedback="The odd word got away!"
    makeWave={makeWave}
    speedForRound={(round) => 0.007 + Math.min(round, 12) * 0.0006}
    scoreForRound={(round) => 10 + Math.max(0, 5 - round)}
    targetAriaLabel={(target) => `Word ${target.label}`}
    onlyGoodBreachesHurt
    onCorrect={() => onRecord(true)}
    onWrong={() => onRecord(false)}
    controlsNote="Bonk the word with the different vowel. Matching words drift away — let them go!"
    gameOverTitle="GAME OVER!"
    repairLabel="Play again"
  />;
}
