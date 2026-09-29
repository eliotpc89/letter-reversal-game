import { useCallback, useRef } from "react";
import { FallingTapper, type TapTarget, type Wave } from "../engines/FallingTapper";
import type { GameContext } from "./types";

type MathProblem = {
  left: number;
  right: number;
  operator: "+" | "−";
  answer: number;
  choices: number[];
};

function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

function makeProblem(round: number): MathProblem {
  const max = round < 5 ? 5 : round < 11 ? 10 : 15;
  const addition = Math.random() < 0.55;
  let left = Math.floor(Math.random() * (max + 1));
  let right = Math.floor(Math.random() * (max + 1));
  if (!addition && right > left) [left, right] = [right, left];
  const answer = addition ? left + right : left - right;
  const nearby = new Set<number>([answer]);
  const offsets = shuffled([-3, -2, -1, 1, 2, 3, 4]);
  for (const offset of offsets) {
    if (nearby.size >= 3) break;
    if (answer + offset >= 0) nearby.add(answer + offset);
  }
  return {
    left,
    right,
    operator: addition ? "+" : "−",
    answer,
    choices: shuffled([...nearby]),
  };
}

/**
 * Math Blasters, re-skinned onto the shared FallingTapper engine.
 * Same scoring (10 + max(0, 5 − round)), same coin flow, same feedback copy.
 * Fall speeds follow the tuned values from the parallel work
 * (0.0075 + round * 0.0006), and the engine adds pause/resume on top.
 */
export function MathBlastersGame({ coins, onBack, onOpenShop, onRecord }: GameContext) {
  const problemRef = useRef<MathProblem | null>(null);

  const makeWave = useCallback((round: number): Wave => {
    const problem = makeProblem(round);
    problemRef.current = problem;
    return {
      prompt: <>{problem.left} {problem.operator} {problem.right} = ?</>,
      targets: problem.choices.map((value, index) => ({
        key: `r${round}-${value}-${index}`,
        label: String(value),
        good: value === problem.answer,
      })),
    };
  }, []);

  const wrongFeedback = useCallback((_wave: Wave, target: TapTarget) => {
    const problem = problemRef.current;
    const equation = problem ? `${problem.left} ${problem.operator} ${problem.right}` : "that problem";
    return `That was ${target.label}. Try the answer to ${equation}!`;
  }, []);

  return <FallingTapper
    shell={{ variant: "math", eyebrow: "Math Blasters", title: "Blast it!", coins, onBack, onOpenShop, fullscreenClass: "math-fullscreen" }}
    promptKicker="Solve it!"
    introFeedback="Blast the answer before it reaches your ship!"
    nextWaveFeedback="Choose the answer and fire!"
    hitFeedback="DIRECT HIT! Great blast!"
    wrongFeedback={wrongFeedback}
    breachFeedback="A target got through — protect your ship!"
    makeWave={makeWave}
    speedForRound={(round) => 0.0075 + Math.min(round, 12) * 0.0006}
    scoreForRound={(round) => 10 + Math.max(0, 5 - round)}
    targetAriaLabel={(target) => `Answer ${target.label}`}
    onCorrect={() => onRecord(true)}
    onWrong={() => onRecord(false)}
    controlsNote="Correct answer = laser blast + coins. Wrong answer = ship damage."
  />;
}
