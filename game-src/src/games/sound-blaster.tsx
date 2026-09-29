import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAudioClip } from "../kit/useAudioClip";
import { playDamage, playLaser, playShieldDown } from "../kit/sfx";
import { useWordBank } from "../content/ContentContext";
import { shuffled, type PracticeWord } from "../content/word-bank";
import type { GameContext } from "./types";

type SoundTarget = { id: string; value: "o" | "u"; x: number; y: number; status: "falling" | "hit" | "wrong" | "missed" };
type Laser = { id: number; angle: number; distance: number };

function makeTargets(): SoundTarget[] {
  return shuffled(["o", "u"] as const).map((value, index) => ({
    id: `${value}-${index}-${Math.random()}`,
    value,
    x: index === 0 ? 34 : 66,
    y: 34 + index * 3,
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

/**
 * Sound Blaster: hear a short-vowel word twice, blast the falling vowel
 * target that matches. Started from the missed-words "Focus these" button,
 * it drills only the words with recorded misses.
 */
export function SoundBlasterGame({ coins, onBack, onOpenShop, onRecord, state, focusMissed }: GameContext) {
  const bank = useWordBank();
  const words = useMemo(() => {
    if (!focusMissed) return bank.SOUND_SORT_WORDS;
    const focused = (state.wordStats ?? [])
      .filter((row) => row.misses > 0)
      .map((row) => bank.SOUND_SORT_WORDS.find((item) => item.word === row.word))
      .filter((item): item is PracticeWord => !!item);
    return focused.length ? focused : bank.SOUND_SORT_WORDS;
  }, [bank, focusMissed, state]);

  const stageRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRepeatTimerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const pendingNextRoundRef = useRef(false);
  const lockedRef = useRef(false);
  const shieldsRef = useRef(3);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<PracticeWord>(() => words[0] ?? bank.DEFAULT_WORD);
  const [targets, setTargets] = useState<SoundTarget[]>(() => makeTargets());
  const [shields, setShields] = useState(3);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("Listen now — it will play again halfway through!");
  const [laser, setLaser] = useState<Laser | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const playWord = useAudioClip();

  const pickWord = useCallback((oldWord?: string) => {
    const pool = wordsRef.current;
    const choices = pool.filter((item) => item.word !== oldWord);
    return shuffled(choices.length ? choices : pool)[0] ?? bank.DEFAULT_WORD;
  }, [bank]);

  useEffect(() => {
    document.documentElement.classList.add("math-fullscreen");
    document.body.classList.add("math-fullscreen");
    return () => {
      document.documentElement.classList.remove("math-fullscreen");
      document.body.classList.remove("math-fullscreen");
    };
  }, []);

  useEffect(() => {
    if (!target.audio || gameOver || paused) return;
    let cancelled = false;
    const speed = 0.0075 + Math.min(round, 12) * 0.0006;
    const halfwayMs = Math.max(1200, Math.round(((83 - 35) / speed) / 2));
    void playWord(target.audio).catch(() => undefined);
    audioRepeatTimerRef.current = window.setTimeout(() => {
      if (!cancelled && !lockedRef.current && !gameOver) void playWord(target.audio).catch(() => undefined);
    }, halfwayMs);
    return () => {
      cancelled = true;
      if (audioRepeatTimerRef.current !== null) {
        window.clearTimeout(audioRepeatTimerRef.current);
        audioRepeatTimerRef.current = null;
      }
    };
  }, [gameOver, paused, playWord, round, target.audio]);

  const nextRound = useCallback(() => {
    setRound((value) => value + 1);
    setTarget((old) => pickWord(old.word));
    setTargets(makeTargets());
    setFeedback("Listen now — it will play again halfway through!");
    setLaser(null);
    lockedRef.current = false;
    setBusy(false);
  }, [pickWord]);

  const scheduleNextRound = useCallback((delay: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pausedRef.current) {
        pendingNextRoundRef.current = true;
        return;
      }
      nextRound();
    }, delay);
  }, [nextRound]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pendingNextRoundRef.current) {
      pendingNextRoundRef.current = false;
      nextRound();
    }
  }, [nextRound, paused]);

  const damage = useCallback(async (message: string) => {
    if (lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (soundOn) {
      if (shieldsRef.current === 1) playShieldDown();
      else playDamage();
    }
    setFeedback(message);
    const nextShields = Math.max(0, shieldsRef.current - 1);
    shieldsRef.current = nextShields;
    setShields(nextShields);
    try {
      await onRecord(false, { word: target.word, vowel: target.vowel });
    } catch {
      // The round didn't save; keep playing rather than soft-locking.
    } finally {
      if (nextShields === 0) { setGameOver(true); setBusy(false); }
      else scheduleNextRound(850);
    }
  }, [gameOver, onRecord, scheduleNextRound, soundOn, target]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(40, now - previous);
      previous = now;
      if (!paused && !lockedRef.current && !gameOver) {
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
  }, [damage, gameOver, paused, round]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const fire = async (choice: SoundTarget) => {
    if (busy || paused || lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (choice.value === target.vowel) {
      if (soundOn) playLaser();
      const stage = stageRef.current?.getBoundingClientRect();
      const width = stage?.width ?? 360;
      const height = stage?.height ?? 560;
      const dx = (choice.x / 100) * width - width * 0.5;
      const dy = (choice.y / 100) * height - height * 0.86;
      setLaser({ id: Date.now(), angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) });
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "hit" } : item));
      setFeedback(`Direct hit! ${target.word} has ${target.vowel === "o" ? "ŏ" : "ŭ"}.`);
      setScore((value) => value + 10 + Math.max(0, 5 - round));
      try {
        await onRecord(true, { word: target.word, vowel: target.vowel });
      } catch {
        // The round didn't save; keep playing rather than soft-locking.
      } finally {
        scheduleNextRound(650);
      }
    } else {
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "wrong" } : item));
      lockedRef.current = false;
      await damage(`That was ${choice.value === "o" ? "ŏ" : "ŭ"}. Listen again!`);
    }
  };

  const togglePause = () => setPaused((value) => {
    pausedRef.current = !value;
    return !value;
  });

  const repair = () => {
    shieldsRef.current = 3;
    lockedRef.current = false;
    setRound(1);
    setTarget(pickWord());
    setTargets(makeTargets());
    setShields(3);
    setScore(0);
    setFeedback("New ship, new mission. Listen now — it will play again halfway through!");
    setLaser(null);
    setGameOver(false);
    setBusy(false);
    setPaused(false);
    pausedRef.current = false;
    pendingNextRoundRef.current = false;
  };

  const shieldPips = useMemo(() => [0, 1, 2], []);

  return <>
    <header className="math-header sound-blaster-header">
      <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
      <div className="math-title"><span>Sound Blaster</span><strong>Blast the vowel!</strong></div>
      <button className="math-pause" type="button" onClick={togglePause} disabled={gameOver} aria-label={paused ? "Resume game" : "Pause game"}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span><small>{paused ? "Resume" : "Pause"}</small></button>
      <div className="math-hud-block math-score-block"><span>Score</span><strong>{score}</strong><small>R{round}</small></div>
      <div className="math-hud-block shield-meter"><span>Shields</span><strong>{shieldPips.map((pip) => <i key={pip} className={pip < shields ? "active" : ""}>◆</i>)}</strong></div>
      <button className="coin-purse math-shop" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><span className="coin coin-small">★</span><strong>{coins}</strong><small>SHOP</small></button>
    </header>
    <main className="math-main">
      <section ref={stageRef} className="math-stage sound-blaster-stage" aria-labelledby="sound-blaster-problem">
        <div className="math-prompt"><span>Listen twice</span><h1 id="sound-blaster-problem">Which vowel?</h1><p>{feedback}</p></div>
        {targets.map((item) => <button key={item.id} className={`answer-target sound-vowel-target ${item.status}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} type="button" onPointerDown={() => void fire(item)} disabled={busy || gameOver || item.status !== "falling"} aria-label={`Blast short ${item.value}`}><b>{item.value.toUpperCase()}</b></button>)}
        {laser && <span key={laser.id} className="math-laser" style={{ "--shot-angle": `${laser.angle}rad`, "--shot-distance": `${laser.distance}px` } as CSSProperties} aria-hidden="true" />}
        {paused && !gameOver && <div className="math-paused" role="status"><strong>PAUSED</strong><span>Tap resume when you’re ready.</span></div>}
        <div className="ship-deck"><Spaceship /></div>
        {gameOver && <div className="math-game-over" role="status"><strong>SHIP DOWN!</strong><span>Last word: {target.word}</span><span>Score: {score}</span><button type="button" onClick={repair}>Repair and play again</button></div>}
      </section>
      <div className="math-controls"><p>The word plays at the start and halfway through.</p><button type="button" onClick={() => setSoundOn((value) => !value)}>{soundOn ? "🔊 Sounds on" : "🔇 Sounds off"}</button></div>
    </main>
  </>;
}
