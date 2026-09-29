import { useCallback, useRef, useState } from "react";
import { FallingTapper, type TapTarget, type Wave } from "../engines/FallingTapper";
import { GameShell } from "../shell/GameShell";
import { useContent } from "../content/ContentContext";
import type { MathSet } from "../content/packs";
import type { GameContext } from "./types";

type MathProblem = {
  left: number;
  right: number;
  operator: "+" | "−";
  answer: number;
};

function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

/**
 * Every problem in a set, in a fresh random order. Sets are pure data
 * (public/content/packs/math-blaster.json), so a new set is one JSON entry:
 * - "+": every x + operand for x in 0..(max - operand); max is the top answer.
 * - "−": every x − operand for x in operand..max; max is the top minuend.
 */
function problemsForSet(set: MathSet): MathProblem[] {
  const list: MathProblem[] = [];
  if (set.operator === "+") {
    for (let x = 0; x <= set.max - set.operand; x++) {
      list.push({ left: x, right: set.operand, operator: "+", answer: x + set.operand });
    }
  } else {
    for (let x = set.operand; x <= set.max; x++) {
      list.push({ left: x, right: set.operand, operator: "−", answer: x - set.operand });
    }
  }
  return shuffled(list);
}

function distractorsFor(answer: number): number[] {
  const nearby = new Set<number>([answer]);
  for (const offset of shuffled([-3, -2, -1, 1, 2, 3, 4])) {
    if (nearby.size >= 3) break;
    if (answer + offset >= 0) nearby.add(answer + offset);
  }
  return shuffled([...nearby]);
}

function setBlurb(set: MathSet): string {
  return set.operator === "+" ? `answers up to ${set.max}` : `take away, up to ${set.max}`;
}

/**
 * Math Blasters, re-skinned onto the shared FallingTapper engine.
 * Same scoring (10 + max(0, 5 − round)), same coin flow, same feedback copy.
 * Fall speeds follow the tuned values (0.0075 + round * 0.0006), and the
 * engine adds pause/resume on top.
 *
 * Problems come from the selected content-pack set, not a random generator:
 * pick a set (e.g. +4) and every wave draws from that set's problems,
 * reshuffling when the deck runs out.
 */
export function MathBlastersGame({ coins, onBack, onOpenShop, onRecord }: GameContext) {
  const { mathBlaster } = useContent();
  const [setId, setSetId] = useState<string | null>(null);
  const set = mathBlaster.sets.find((candidate) => candidate.id === setId) ?? null;
  const problemRef = useRef<MathProblem | null>(null);
  const deckRef = useRef<{ setId: string; problems: MathProblem[]; index: number } | null>(null);

  const makeWave = useCallback((round: number): Wave => {
    const active = set;
    if (!active) throw new Error("Math Blasters wave with no set selected");
    let deck = deckRef.current;
    if (!deck || deck.setId !== active.id) {
      deck = { setId: active.id, problems: problemsForSet(active), index: 0 };
      deckRef.current = deck;
    }
    if (deck.index >= deck.problems.length) {
      deck.problems = shuffled(deck.problems);
      deck.index = 0;
    }
    const problem = deck.problems[deck.index++];
    if (!problem) throw new Error("Math Blasters deck ran dry mid-wave");
    problemRef.current = problem;
    const choices = distractorsFor(problem.answer);
    return {
      prompt: <>{problem.left} {problem.operator} {problem.right} = ?</>,
      targets: choices.map((value, index) => ({
        key: `r${round}-${value}-${index}`,
        label: String(value),
        good: value === problem.answer,
      })),
    };
  }, [set]);

  const wrongFeedback = useCallback((_wave: Wave, target: TapTarget) => {
    const problem = problemRef.current;
    const equation = problem ? `${problem.left} ${problem.operator} ${problem.right}` : "that problem";
    return `That was ${target.label}. Try the answer to ${equation}!`;
  }, []);

  if (!set) {
    const groups: Array<[string, MathSet[]]> = [
      ["Adding", mathBlaster.sets.filter((candidate) => candidate.operator === "+")],
      ["Take away", mathBlaster.sets.filter((candidate) => candidate.operator === "−")],
    ];
    return (
      <GameShell variant="math" eyebrow="Math Blasters" title="Pick your blast!" coins={coins} onBack={onBack} onOpenShop={onOpenShop}>
        <main className="practice-main">
          {groups.map(([title, sets]) => sets.length === 0 ? null : (
            <section key={title} className="practice-stage" aria-label={`${title} problem sets`} style={{ marginBottom: 14 }}>
              <p className="round-count">{title}</p>
              <div className="word-choices">
                {sets.map((candidate) => (
                  <button key={candidate.id} type="button" onClick={() => setSetId(candidate.id)} aria-label={`Play ${candidate.label}, ${setBlurb(candidate)}`}>
                    <span>{candidate.label}</span>
                    <b style={{ display: "block", fontSize: 14 }}>{setBlurb(candidate)}</b>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </main>
      </GameShell>
    );
  }

  return <FallingTapper
    key={set.id}
    shell={{ variant: "math", eyebrow: "Math Blasters", title: `Blast it! ${set.label}`, coins, onBack: () => setSetId(null), onOpenShop, fullscreenClass: "math-fullscreen" }}
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
