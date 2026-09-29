import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ensureAudioContext } from "./kit/audio";
import { playDamage, playLaser, playShieldDown } from "./kit/sfx";

type MathProblem = {
  left: number;
  right: number;
  operator: "+" | "−";
  answer: number;
  choices: number[];
};

type AnswerTarget = {
  id: string;
  value: number;
  x: number;
  y: number;
  status: "falling" | "hit" | "wrong" | "missed";
};

type Laser = { id: number; angle: number; distance: number };

type MathBlastersProps = {
  coins: number;
  onBack: () => void;
  onOpenShop: () => void;
  onRecord: (correct: boolean) => Promise<void>;
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

function makeTargets(problem: MathProblem): AnswerTarget[] {
  const positions = shuffled([22, 50, 78]);
  return problem.choices.map((value, index) => ({
    id: `${value}-${index}-${Math.random()}`,
    value,
    x: positions[index] ?? 50,
    // Keep every bubble below the prompt. They only move downward, so this
    // creates a protected equation/header lane at the top of the playfield.
    y: 27 + (index % 2) * 3,
    status: "falling" as const,
  }));
}

function Spaceship() {
  return <div className="math-ship" aria-hidden="true">
    <span className="ship-flame" />
    <svg viewBox="0 0 120 86" role="presentation">
      <path d="M60 5 90 60H30Z" fill="#9fd8ff" stroke="#14213d" strokeWidth="6" />
      <path d="M31 60 8 78l9-29 21-3M89 60l23 18-9-29-21-3" fill="#4786c6" stroke="#14213d" strokeWidth="6" strokeLinejoin="round" />
      <path d="M60 24 75 58H45Z" fill="#eaf8ff" stroke="#14213d" strokeWidth="4" />
      <circle cx="60" cy="35" r="5" fill="#ff5a5f" />
    </svg>
  </div>;
}

export function MathBlasters({ coins, onBack, onOpenShop, onRecord }: MathBlastersProps) {
  const stageRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const shieldsRef = useRef(3);
  const [round, setRound] = useState(1);
  const [problem, setProblem] = useState<MathProblem>(() => makeProblem(1));
  const [targets, setTargets] = useState<AnswerTarget[]>(() => makeTargets(problem));
  const [shields, setShields] = useState(3);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("Blast the answer before it reaches your ship!");
  const [laser, setLaser] = useState<Laser | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add("math-fullscreen");
    document.body.classList.add("math-fullscreen");
    return () => {
      document.documentElement.classList.remove("math-fullscreen");
      document.body.classList.remove("math-fullscreen");
    };
  }, []);

  const nextRound = useCallback(() => {
    const next = round + 1;
    const nextProblem = makeProblem(next);
    setRound(next);
    setProblem(nextProblem);
    setTargets(makeTargets(nextProblem));
    setFeedback("Choose the answer and fire!");
    setLaser(null);
    lockedRef.current = false;
    setBusy(false);
  }, [round]);

  const damage = useCallback(async (message: string) => {
    if (lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (soundOn) playDamage();
    setFeedback(message);
    const nextShields = Math.max(0, shieldsRef.current - 1);
    shieldsRef.current = nextShields;
    setShields(nextShields);
    try {
      await onRecord(false);
    } catch {
      // The round didn't save; keep playing rather than soft-locking.
    } finally {
      if (nextShields === 0) {
        if (soundOn) playShieldDown();
        setGameOver(true);
        setBusy(false);
      } else {
        timerRef.current = window.setTimeout(nextRound, 850);
      }
    }
  }, [gameOver, nextRound, onRecord, soundOn]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(40, now - previous);
      previous = now;
      if (!lockedRef.current && !gameOver) {
        setTargets((current) => {
          const next = current.map((target) => target.status === "falling"
            ? { ...target, y: target.y + delta * (0.009 + Math.min(round, 12) * 0.0008) }
            : target);
          const breached = next.find((target) => target.status === "falling" && target.y >= 83);
          if (breached) void damage("A target got through — protect your ship!");
          return next;
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [damage, gameOver, round]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const fire = async (target: AnswerTarget) => {
    if (busy || lockedRef.current || gameOver) return;
    ensureAudioContext();
    lockedRef.current = true;
    setBusy(true);
    if (target.value === problem.answer) {
      if (soundOn) playLaser();
      const stage = stageRef.current?.getBoundingClientRect();
      const width = stage?.width ?? 360;
      const height = stage?.height ?? 560;
      const dx = (target.x / 100) * width - width * 0.5;
      const dy = (target.y / 100) * height - height * 0.86;
      setLaser({ id: Date.now(), angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) });
      setTargets((current) => current.map((item) => item.id === target.id ? { ...item, status: "hit" } : item));
      setFeedback("DIRECT HIT! Great blast!");
      setScore((value) => value + 10 + Math.max(0, 5 - round));
      try {
        await onRecord(true);
      } catch {
        // The round didn't save; keep playing rather than soft-locking.
      } finally {
        timerRef.current = window.setTimeout(nextRound, 650);
      }
    } else {
      setTargets((current) => current.map((item) => item.id === target.id ? { ...item, status: "wrong" } : item));
      lockedRef.current = false;
      await damage(`That was ${target.value}. Try the answer to ${problem.left} ${problem.operator} ${problem.right}!`);
    }
  };

  const repair = () => {
    const nextProblem = makeProblem(1);
    shieldsRef.current = 3;
    lockedRef.current = false;
    setRound(1);
    setProblem(nextProblem);
    setTargets(makeTargets(nextProblem));
    setShields(3);
    setScore(0);
    setFeedback("New ship, new mission. Blast the answer!");
    setLaser(null);
    setGameOver(false);
    setBusy(false);
  };

  const shieldPips = useMemo(() => [0, 1, 2], []);

  return <>
    <header className="math-header">
      <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
      <div className="math-title"><span>Math Blasters</span><strong>Blast it!</strong></div>
      <div className="math-hud-block math-score-block"><span>Score</span><strong>{score}</strong><small>R{round}</small></div>
      <div className="math-hud-block shield-meter"><span>Shields</span><strong>{shieldPips.map((pip) => <i key={pip} className={pip < shields ? "active" : ""}>◆</i>)}</strong></div>
      <button className="coin-purse math-shop" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><span className="coin coin-small">★</span><strong>{coins}</strong><small>SHOP</small></button>
    </header>
    <main className="math-main">
      <section ref={stageRef} className="math-stage" aria-labelledby="math-problem">
        <div className="math-stars" aria-hidden="true" />
        <div className="math-prompt"><span>Solve it!</span><h1 id="math-problem">{problem.left} {problem.operator} {problem.right} = ?</h1><p>{feedback}</p></div>
        {targets.map((target) => <button
          key={target.id}
          className={`answer-target ${target.status}`}
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
          type="button"
          onPointerDown={() => void fire(target)}
          disabled={busy || gameOver || target.status !== "falling"}
          aria-label={`Answer ${target.value}`}
        >{target.value}</button>)}
        {laser && <span key={laser.id} className="math-laser" style={{ "--shot-angle": `${laser.angle}rad`, "--shot-distance": `${laser.distance}px` } as CSSProperties} aria-hidden="true" />}
        <div className="ship-deck"><Spaceship /></div>
        {gameOver && <div className="math-game-over" role="status"><strong>SHIP DOWN!</strong><span>Score: {score}</span><button type="button" onClick={repair}>Repair and play again</button></div>}
      </section>
      <div className="math-controls"><p>Correct answer = laser blast + coins. Wrong answer = ship damage.</p><button type="button" onClick={() => setSoundOn((value) => !value)}>{soundOn ? "🔊 Sounds on" : "🔇 Sounds off"}</button></div>
    </main>
  </>;
}
