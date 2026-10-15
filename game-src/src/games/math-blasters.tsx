import { useCallback, useMemo, useRef, useState } from "react";
import { FallingTapper, type TapTarget, type Wave } from "../engines/FallingTapper";
import { GameShell } from "../shell/GameShell";
import { useContent } from "../content/ContentContext";
import { AUDIO_CACHE_BUST } from "../content/word-bank";
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

function problemLabel(problem: MathProblem): string {
  return `${problem.left} ${problem.operator} ${problem.right}`;
}

/** Parse a recorded "7 + 8" / "12 − 4" label back into a problem. */
function parseProblemLabel(label: string): MathProblem | null {
  const match = /^(\d+) ([+−]) (\d+)$/.exec(label);
  if (!match) return null;
  const left = parseInt(match[1] ?? "", 10);
  const operator = (match[2] ?? "+") as "+" | "−";
  const right = parseInt(match[3] ?? "", 10);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { left, right, operator, answer: operator === "+" ? left + right : left - right };
}

function setBlurb(set: MathSet): string {
  return set.operator === "+" ? `answers up to ${set.max}` : `take away, up to ${set.max}`;
}

/**
 * Math Blasters, re-skinned onto the shared FallingTapper engine.
 * Same scoring (10 + max(0, 5 − round)), same coin flow, same feedback copy.
 * Fall speeds follow the tuned values (0.0075 + round * 0.0006), scaled by the
 * global FALL_SPEED_SCALE (25% slower), and the
 * engine adds pause/resume on top.
 *
 * Problems come from the selected content-pack set, not a random generator:
 * pick one or more sets and every wave draws from their combined problems,
 * reshuffling when the deck runs out.
 */
export function MathBlastersGame({ coins, onBack, onOpenShop, onRecord, awardBonus, state, focusMissed }: GameContext) {
  const { mathBlaster } = useContent();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const selectedSets = useMemo(() => mathBlaster.sets.filter((candidate) => selectedIds.includes(candidate.id)), [mathBlaster.sets, selectedIds]);
  const selectionKey = selectedSets.map((set) => set.id).join(",");
  const selectionLabel = selectedSets.map((set) => set.label).join(", ");
  const toggleSet = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const problemRef = useRef<MathProblem | null>(null);
  const deckRef = useRef<{ key: string; problems: MathProblem[]; index: number } | null>(null);

  /**
   * Started from the missed-numbers "Focus these" button: drill only the
   * problems with recorded misses. Falls back to the full set when there
   * is nothing to focus (e.g. misses were just reset mid-session).
   */
  const focusProblems = useMemo(() => {
    if (!focusMissed) return null;
    const parsed = (state.mathStats ?? [])
      .filter((row) => row.misses > 0)
      .flatMap((row) => {
        const problem = parseProblemLabel(row.problem);
        return problem ? [problem] : [];
      });
    return parsed.length ? parsed : null;
  }, [focusMissed, state]);

  const makeWave = useCallback((round: number): Wave => {
    if (!selectedSets.length) throw new Error("Math Blasters wave with no sets selected");
    const matchingMisses = focusProblems?.filter((problem) => selectedSets.some((set) =>
      problem.operator === set.operator && problem.right === set.operand &&
      problem.left >= (set.operator === "+" ? 0 : set.operand) &&
      problem.left <= (set.operator === "+" ? set.max - set.operand : set.max)
    ));
    const deckKey = `${selectionKey}:${focusProblems ? "missed" : "all"}`;
    let deck = deckRef.current;
    if (!deck || deck.key !== deckKey) {
      deck = { key: deckKey, problems: shuffled(matchingMisses?.length ? matchingMisses : selectedSets.flatMap(problemsForSet)), index: 0 };
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
  }, [selectedSets, selectionKey, focusProblems]);

  const wrongFeedback = useCallback((_wave: Wave, target: TapTarget) => {
    const problem = problemRef.current;
    const equation = problem ? `${problem.left} ${problem.operator} ${problem.right}` : "that problem";
    return `That was ${target.label}. Try the answer to ${equation}!`;
  }, []);

  const wrongAudio = useCallback((_wave: Wave, target: TapTarget) => {
    const problem = problemRef.current;
    if (!problem) return null;
    const op = problem.operator === "+" ? "plus" : "minus";
    return `content/audio/math/${problem.left}-${op}-${problem.right}-equals-${problem.answer}.mp3?v=${AUDIO_CACHE_BUST}`;
  }, []);

  const recordProblem = useCallback((correct: boolean) => {
    const problem = problemRef.current;
    return problem ? onRecord(correct, { problem: problemLabel(problem) }) : onRecord(correct);
  }, [onRecord]);

  if (!playing) {
    const groups: Array<[string, MathSet[]]> = [
      ["Adding", mathBlaster.sets.filter((candidate) => candidate.operator === "+")],
      ["Take away", mathBlaster.sets.filter((candidate) => candidate.operator === "−")],
    ];
    return (
      <GameShell variant="math" eyebrow="Math Blasters" title="Pick your blast!" coins={coins} onBack={onBack} onOpenShop={onOpenShop}>
        <main className="practice-main">
          <section className="practice-stage math-set-controls" aria-label="Practice selection" style={{ marginBottom: 14 }}>
            <p>Pick one or more sets, then start your blast!</p>
            <button type="button" onClick={() => setSelectedIds(mathBlaster.sets.filter((set) => set.operator === "+" && set.operand >= 1 && set.operand <= 5).map((set) => set.id))}>Select +1 through +5</button>
            <p role="status">{selectedSets.length ? `Selected: ${selectionLabel}` : "No sets selected yet"}</p>
            <button type="button" disabled={!selectedSets.length} onClick={() => { deckRef.current = null; setPlaying(true); }}>Start blast!</button>
          </section>
          {groups.map(([title, sets]) => sets.length === 0 ? null : (
            <section key={title} className="practice-stage" aria-label={`${title} problem sets`} style={{ marginBottom: 14 }}>
              <p className="round-count">{title}</p>
              <div className="word-choices">
                {sets.map((candidate) => (
                  <button key={candidate.id} type="button" onClick={() => toggleSet(candidate.id)} aria-pressed={selectedIds.includes(candidate.id)} aria-label={`Select ${candidate.label}, ${setBlurb(candidate)}`}>
                    <span>{selectedIds.includes(candidate.id) ? "✓ " : ""}{candidate.label}</span>
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
    key={`${selectionKey}${focusMissed ? "-missed" : ""}`}
    shell={{ variant: "math", eyebrow: "Math Blasters", title: `Blast it! ${selectionLabel}${focusProblems ? " — missed focus" : ""}`, coins, onBack: () => setPlaying(false), onOpenShop, fullscreenClass: "math-fullscreen" }}
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
    onCorrect={() => recordProblem(true)}
    onWrong={() => recordProblem(false)}
    revealCorrectOnWrong
    wrongPauseMs={5000}
    wrongAudio={wrongAudio}
    powerStreak
    streakGoal={20}
    streakBonusCoins={200}
    victoryTitle="BONUS UNLOCKED!"
    onStreakBonus={awardBonus}
    controlsNote="Correct answer = laser blast + coins. Wrong answer = ship damage."
  />;
}
