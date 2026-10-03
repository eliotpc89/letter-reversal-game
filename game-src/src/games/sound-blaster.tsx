import { useCallback, useMemo, useRef } from "react";
import { FallingTapper, type Wave } from "../engines/FallingTapper";
import { useWordBank } from "../content/ContentContext";
import { shuffled, type PracticeWord } from "../content/word-bank";
import type { GameContext } from "./types";

/** Audio/word adapter; combat, reveal, damage, power and bonuses live in FallingTapper. */
export function SoundBlasterGame({ coins, onBack, onOpenShop, onRecord, awardBonus, state, focusMissed }: GameContext) {
  const bank = useWordBank();
  const words = useMemo(() => {
    if (!focusMissed) return bank.SOUND_SORT_WORDS;
    const focused = (state.wordStats ?? [])
      .filter((row) => row.misses > 0)
      .map((row) => bank.SOUND_SORT_WORDS.find((item) => item.word === row.word))
      .filter((item): item is PracticeWord => !!item);
    return focused.length ? focused : bank.SOUND_SORT_WORDS;
  }, [bank, focusMissed, state]);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const wordRef = useRef<PracticeWord | null>(null);

  const makeWave = useCallback((round: number): Wave => {
    const pool = wordsRef.current;
    const choices = pool.filter((item) => item.word !== wordRef.current?.word);
    const word = shuffled(choices.length ? choices : pool)[0] ?? bank.DEFAULT_WORD;
    wordRef.current = word;
    // The whole word spelled in gold; the vowel letter carries the reveal
    // anchor the gold bubble flies to on a wrong answer.
    const vowelAt = Math.max(0, word.vowelIndex);
    return {
      prompt: (
        <span className="prompt-word-gold">
          {word.word.slice(0, vowelAt)}
          <span data-reveal-anchor>{word.word.slice(vowelAt, vowelAt + 1)}</span>
          {word.word.slice(vowelAt + 1)}
        </span>
      ),
      audio: word.audio,
      targets: ["o", "u"].map((vowel) => ({
        key: `r${round}-${vowel}`,
        label: vowel.toUpperCase(),
        good: vowel === word.vowel,
      })),
    };
  }, [bank.DEFAULT_WORD]);

  const recordWord = useCallback((correct: boolean) => {
    const word = wordRef.current;
    return word ? onRecord(correct, { word: word.word, vowel: word.vowel }) : onRecord(correct);
  }, [onRecord]);

  return <FallingTapper
    shell={{ variant: "math", eyebrow: "Sound Blaster", title: "Blast the vowel!", coins, onBack, onOpenShop, fullscreenClass: "math-fullscreen" }}
    promptKicker="Listen twice"
    introFeedback="Listen now — it will play again halfway through!"
    nextWaveFeedback="Listen now — it will play again halfway through!"
    hitFeedback="DIRECT HIT! Great listening!"
    wrongFeedback={(_wave, target) => `That was ${target.label}. Listen again — the right vowel is gold!`}
    breachFeedback="A vowel got through — protect your ship!"
    makeWave={makeWave}
    speedForRound={(round) => 0.0075 + Math.min(round, 12) * 0.0006}
    scoreForRound={(round) => 10 + Math.max(0, 5 - round)}
    targetAriaLabel={(target) => `Blast short ${target.label.toLowerCase()}`}
    onCorrect={() => recordWord(true)}
    onWrong={() => recordWord(false)}
    revealCorrectOnWrong
    wrongPauseMs={5000}
    wrongAudio={(wave) => wave.audio ?? null}
    powerStreak
    streakGoal={20}
    streakBonusCoins={200}
    victoryTitle="BONUS UNLOCKED!"
    onStreakBonus={awardBonus}
    controlsNote="The word plays at the start and halfway through. A miss reveals the gold vowel and repeats the word."
  />;
}
