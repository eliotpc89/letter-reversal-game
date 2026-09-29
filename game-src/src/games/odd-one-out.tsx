import { useCallback } from "react";
import { FallingTapper, type TapTarget, type Wave } from "../engines/FallingTapper";
import { useContent, useWordBank } from "../content/ContentContext";
import { shuffled } from "../content/word-bank";
import type { GameContext } from "./types";

/**
 * Odd One Out on the FallingTapper engine.
 *
 * Three falling words share a short vowel, one doesn't — bonk the odd one.
 * Round definitions (which pools oppose) come from the odd-one-out content
 * pack; the word pools come from the phonics-core pack. The mechanic is
 * 100% engine.
 */

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

export function OddOneOutGame({ coins, onBack, onOpenShop, onRecord }: GameContext) {
  const bank = useWordBank();
  const { oddOneOut } = useContent();

  const makeWave = useCallback((round: number): Wave => {
    const spec = oddOneOut.rounds[round % oddOneOut.rounds.length] ?? oddOneOut.rounds[0]!;
    const matchPool = spec.matchPool === "short-o" ? bank.SHORT_O_WORDS : bank.SHORT_U_WORDS;
    const oddPool = spec.oddPool === "short-o" ? bank.SHORT_O_WORDS : bank.SHORT_U_WORDS;
    const seen = new Set<string>();
    const matchWords = pick(matchPool, 3, seen);
    const [oddWord] = pick(oddPool, 1, seen);
    const targets: TapTarget[] = shuffled([
      ...matchWords.map((word, index) => ({ key: `m${round}-${index}`, label: word, good: false })),
      { key: `odd-${round}`, label: oddWord ?? "up", good: true },
    ]);
    return { prompt: "Bonk the word with the different vowel!", targets };
  }, [bank, oddOneOut]);

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
