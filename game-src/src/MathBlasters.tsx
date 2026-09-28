import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

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

type Laser = { id: number; x: number; y: number };

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
    y: -7 - (index % 2) * 4,
    status: "falling" as const,
  }));
}

function createAudioContext(ref: MutableRefObject<AudioContext | null>): AudioContext | null {
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const context = ref.current ?? new AudioCtx();
  ref.current = context;
  if (context.state === "suspended") void context.resume();
  return context;
}

function playLaser(context: AudioContext | null) {
  if (!context || context.state !== "running") return;
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(1500, start);
  oscillator.frequency.exponentialRampToValueAtTime(240, start + 0.18);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.13, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.22);
}

function playDamage(context: AudioContext | null) {
  if (!context || context.state !== "running") return;
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(180, start);
  oscillator.frequency.exponentialRampToValueAtTime(55, start + 0.38);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.42);
}

function playShieldDown(context: AudioContext | null) {
  if (!context || context.state !== "running") return;
  [130, 98, 65].forEach((frequency, index) => {
    const start = context.currentTime + index * 0.08;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.11, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
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
  const audioRef = useRef<AudioContext | null>(null);
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
    if (soundOn) playDamage(createAudioContext(audioRef));
    setFeedback(message);
    const nextShields = Math.max(0, shieldsRef.current - 1);
    shieldsRef.current = nextShields;
    setShields(nextShields);
    await onRecord(false);
    if (nextShields === 0) {
      if (soundOn) playShieldDown(createAudioContext(audioRef));
      setGameOver(true);
      setBusy(false);
    } else {
      timerRef.current = window.setTimeout(nextRound, 850);
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
            ? { ...target, y: target.y + delta * (0.022 + Math.min(round, 12) * 0.0018) }
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
    const context = audioRef.current;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const fire = async (target: AnswerTarget) => {
    if (busy || lockedRef.current || gameOver) return;
    createAudioContext(audioRef);
    lockedRef.current = true;
    setBusy(true);
    if (target.value === problem.answer) {
      if (soundOn) playLaser(createAudioContext(audioRef));
      setLaser({ id: Date.now(), x: target.x, y: target.y });
      setTargets((current) => current.map((item) => item.id === target.id ? { ...item, status: "hit" } : item));
      setFeedback("DIRECT HIT! Great blast!");
      setScore((value) => value + 10 + Math.max(0, 5 - round));
      await onRecord(true);
      timerRef.current = window.setTimeout(nextRound, 650);
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
      <div><span>Math Blasters</span><strong>Blast the answer!</strong></div>
      <button className="coin-purse small-purse" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><span className="coin coin-small">★</span><strong>{coins}</strong></button>
    </header>
    <main className="math-main">
      <section className="math-scorebar" aria-label="Math Blasters score">
        <div><span>Score</span><strong>{score}</strong></div>
        <div><span>Round</span><strong>{round}</strong></div>
        <div className="shield-meter"><span>Ship shields</span><strong>{shieldPips.map((pip) => <i key={pip} className={pip < shields ? "active" : ""}>◆</i>)}</strong></div>
      </section>
      <section className="math-stage" aria-labelledby="math-problem">
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
        {laser && <span key={laser.id} className="math-laser" style={{ left: "50%", top: "86%", width: `${Math.hypot(laser.x - 50, laser.y - 86)}%`, transform: `rotate(${Math.atan2(laser.y - 86, laser.x - 50)}rad)` }} aria-hidden="true" />}
        <div className="ship-deck"><Spaceship /></div>
        {gameOver && <div className="math-game-over" role="status"><strong>SHIP DOWN!</strong><span>Score: {score}</span><button type="button" onClick={repair}>Repair and play again</button></div>}
      </section>
      <div className="math-controls"><p>Correct answer = laser blast + coins. Wrong answer = ship damage.</p><button type="button" onClick={() => setSoundOn((value) => !value)}>{soundOn ? "🔊 Sounds on" : "🔇 Sounds off"}</button></div>
    </main>
  </>;
}
