import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type { Vowel } from "./src/api";

type SoundWord = { word: string; vowel: Vowel; audio: string };
type SoundTarget = { id: string; value: Vowel; x: number; y: number; status: "falling" | "hit" | "wrong" | "missed" };
type Laser = { id: number; angle: number; distance: number };

type SoundBlasterProps = {
  coins: number;
  words: SoundWord[];
  onBack: () => void;
  onOpenShop: () => void;
  onRecord: (correct: boolean, word: SoundWord) => Promise<void>;
};

function shuffled<T>(values: readonly T[]): T[] { return [...values].sort(() => Math.random() - 0.5); }

function makeTargets(): SoundTarget[] {
  return shuffled(["o", "u"] as const).map((value, index) => ({
    id: `${value}-${index}-${Math.random()}`,
    value,
    x: index === 0 ? 34 : 66,
    y: 34 + index * 3,
    status: "falling" as const,
  }));
}

function playTone(ref: MutableRefObject<AudioContext | null>, kind: "laser" | "damage" | "down") {
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const context = ref.current ?? new AudioCtx();
  ref.current = context;
  if (context.state === "suspended") void context.resume();
  if (context.state !== "running") return;
  const notes = kind === "laser" ? [1500, 240] : kind === "damage" ? [180, 55] : [130, 98, 65];
  notes.forEach((frequency, index) => {
    const start = context.currentTime + (kind === "down" ? index * 0.08 : 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "damage" ? "sawtooth" : kind === "laser" ? "square" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (kind === "laser") oscillator.frequency.exponentialRampToValueAtTime(240, start + 0.18);
    if (kind === "damage") oscillator.frequency.exponentialRampToValueAtTime(55, start + 0.38);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === "laser" ? 0.13 : 0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === "down" ? 0.18 : kind === "damage" ? 0.4 : 0.2));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + (kind === "damage" ? 0.42 : 0.22));
  });
}

function useDoubleWordAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audioRef.current?.pause(), []);
  return useCallback(async (src: string) => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    const playOnce = () => new Promise<void>((resolve, reject) => {
      const done = () => { audio.removeEventListener("ended", done); resolve(); };
      audio.addEventListener("ended", done, { once: true });
      void audio.play().catch((error) => { audio.removeEventListener("ended", done); reject(error); });
    });
    audio.pause();
    audio.src = src;
    audio.preload = "auto";
    audio.volume = 1;
    audio.currentTime = 0;
    await playOnce();
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    audio.currentTime = 0;
    await playOnce();
  }, []);
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

export function SoundBlaster({ coins, words, onBack, onOpenShop, onRecord }: SoundBlasterProps) {
  const audioRef = useRef<AudioContext | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const shieldsRef = useRef(3);
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<SoundWord>(() => words[0] ?? { word: "cot", vowel: "o", audio: "" });
  const [targets, setTargets] = useState<SoundTarget[]>(() => makeTargets());
  const [shields, setShields] = useState(3);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("Hear the word twice, then blast its vowel!");
  const [laser, setLaser] = useState<Laser | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const playWord = useDoubleWordAudio();

  const pickWord = useCallback((oldWord?: string) => {
    const choices = words.filter((item) => item.word !== oldWord);
    return shuffled(choices.length ? choices : words)[0] ?? { word: "cot", vowel: "o", audio: "" };
  }, [words]);

  useEffect(() => {
    document.documentElement.classList.add("math-fullscreen");
    document.body.classList.add("math-fullscreen");
    return () => {
      document.documentElement.classList.remove("math-fullscreen");
      document.body.classList.remove("math-fullscreen");
    };
  }, []);

  const nextRound = useCallback(() => {
    setRound((value) => value + 1);
    setTarget((old) => pickWord(old.word));
    setTargets(makeTargets());
    setFeedback("Hear it twice, then choose ŏ or ŭ!");
    setLaser(null);
    lockedRef.current = false;
    setBusy(false);
  }, [pickWord]);

  const damage = useCallback(async (message: string) => {
    if (lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (soundOn) playTone(audioRef, shieldsRef.current === 1 ? "down" : "damage");
    setFeedback(message);
    const nextShields = Math.max(0, shieldsRef.current - 1);
    shieldsRef.current = nextShields;
    setShields(nextShields);
    await onRecord(false, target);
    if (nextShields === 0) { setGameOver(true); setBusy(false); }
    else timerRef.current = window.setTimeout(nextRound, 850);
  }, [gameOver, nextRound, onRecord, soundOn, target]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(40, now - previous);
      previous = now;
      if (!lockedRef.current && !gameOver) {
        setTargets((current) => {
          const next = current.map((item) => item.status === "falling" ? { ...item, y: item.y + delta * (0.0075 + Math.min(round, 12) * 0.0006) } : item);
          const breached = next.find((item) => item.status === "falling" && item.y >= 83);
          if (breached) void damage("A vowel got through — listen and protect your ship!");
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

  const fire = async (choice: SoundTarget) => {
    if (busy || lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (choice.value === target.vowel) {
      if (soundOn) playTone(audioRef, "laser");
      const stage = stageRef.current?.getBoundingClientRect();
      const width = stage?.width ?? 360;
      const height = stage?.height ?? 560;
      const dx = (choice.x / 100) * width - width * 0.5;
      const dy = (choice.y / 100) * height - height * 0.86;
      setLaser({ id: Date.now(), angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) });
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "hit" } : item));
      setFeedback(`Direct hit! ${target.word} has ${target.vowel === "o" ? "ŏ" : "ŭ"}.`);
      setScore((value) => value + 10 + Math.max(0, 5 - round));
      await onRecord(true, target);
      timerRef.current = window.setTimeout(nextRound, 650);
    } else {
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "wrong" } : item));
      lockedRef.current = false;
      await damage(`That was ${choice.value === "o" ? "ŏ" : "ŭ"}. Listen again!`);
    }
  };

  const repair = () => {
    shieldsRef.current = 3;
    lockedRef.current = false;
    setRound(1);
    setTarget(pickWord());
    setTargets(makeTargets());
    setShields(3);
    setScore(0);
    setFeedback("New ship, new mission. Hear the word twice!");
    setLaser(null);
    setGameOver(false);
    setBusy(false);
  };

  const shieldPips = useMemo(() => [0, 1, 2], []);

  return <>
    <header className="math-header sound-blaster-header">
      <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
      <div className="math-title"><span>Sound Blaster</span><strong>Blast the vowel!</strong></div>
      <div className="math-hud-block math-score-block"><span>Score</span><strong>{score}</strong><small>R{round}</small></div>
      <div className="math-hud-block shield-meter"><span>Shields</span><strong>{shieldPips.map((pip) => <i key={pip} className={pip < shields ? "active" : ""}>◆</i>)}</strong></div>
      <button className="coin-purse math-shop" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><span className="coin coin-small">★</span><strong>{coins}</strong><small>SHOP</small></button>
    </header>
    <main className="math-main">
      <section ref={stageRef} className="math-stage sound-blaster-stage" aria-labelledby="sound-blaster-problem">
        <div className="math-prompt"><span>Listen twice</span><h1 id="sound-blaster-problem">Which vowel?</h1><p>{feedback}</p></div>
        <button className="sound-blaster-listen" type="button" onClick={() => void playWord(target.audio).catch(() => undefined)} disabled={busy || gameOver}>🔊 Hear the word twice</button>
        {targets.map((item) => <button key={item.id} className={`answer-target sound-vowel-target ${item.status}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} type="button" onPointerDown={() => void fire(item)} disabled={busy || gameOver || item.status !== "falling"} aria-label={`Blast short ${item.value}`}><b>{item.value.toUpperCase()}</b></button>)}
        {laser && <span key={laser.id} className="math-laser" style={{ "--shot-angle": `${laser.angle}rad`, "--shot-distance": `${laser.distance}px` } as CSSProperties} aria-hidden="true" />}
        <div className="ship-deck"><Spaceship /></div>
        {gameOver && <div className="math-game-over" role="status"><strong>SHIP DOWN!</strong><span>Last word: {target.word}</span><span>Score: {score}</span><button type="button" onClick={repair}>Repair and play again</button></div>}
      </section>
      <div className="math-controls"><p>Listen twice, then blast the vowel sound.</p><button type="button" onClick={() => setSoundOn((value) => !value)}>{soundOn ? "🔊 Sounds on" : "🔇 Sounds off"}</button></div>
    </main>
  </>;
}
