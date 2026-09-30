import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAudioClip } from "../kit/useAudioClip";
import { ensureAudioContext } from "../kit/audio";
import { playLaser } from "../kit/sfx";
import { useContent } from "../content/ContentContext";
import { shuffled, type BonusWord } from "../content/word-bank";
import type { GameContext } from "./types";

type BonusTarget = { id: string; label: string; correct: boolean; x: number; y: number; status: "falling" | "hit" | "wrong" };
type Laser = { id: number; angle: number; distance: number };

const FALLBACK_WORD: BonusWord = { word: "puff", fake: "puf", audio: "" };

function makeTargets(word: BonusWord): BonusTarget[] {
  return shuffled([
    { label: word.word, correct: true },
    { label: word.fake, correct: false },
  ]).map((item, index) => ({
    ...item,
    id: `${item.label}-${Date.now()}-${Math.random()}`,
    x: index === 0 ? 31 : 69,
    y: 35,
    status: "falling" as const,
  }));
}

/**
 * Bonus Letter Blaster: hear a word twice, blast the spelling with the
 * bonus letter (the extra f, l, or s).
 */
export function BonusLetterBlasterGame({ coins, onBack, onOpenShop, onRecord }: GameContext) {
  const { bonusWords } = useContent();
  const words = bonusWords.length ? bonusWords : [FALLBACK_WORD];
  const timerRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const pausedRef = useRef(false);
  const lockedRef = useRef(false);
  const shieldsRef = useRef(3);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<BonusWord>(() => words[0] ?? FALLBACK_WORD);
  const [targets, setTargets] = useState<BonusTarget[]>(() => makeTargets(words[0] ?? FALLBACK_WORD));
  const [shields, setShields] = useState(3);
  const [score, setScore] = useState(0);
  const [laser, setLaser] = useState<Laser | null>(null);
  const [feedback, setFeedback] = useState("Listen twice — blast the word with the bonus letter!");
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const playWord = useAudioClip();

  const pickWord = useCallback((oldWord?: string) => {
    const pool = wordsRef.current;
    const choices = pool.filter((item) => item.word !== oldWord);
    return shuffled(choices.length ? choices : pool)[0] ?? FALLBACK_WORD;
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("math-fullscreen");
    document.body.classList.add("math-fullscreen");
    return () => {
      document.documentElement.classList.remove("math-fullscreen");
      document.body.classList.remove("math-fullscreen");
    };
  }, []);

  useEffect(() => {
    if (!target.audio || paused || gameOver) return;
    let cancelled = false;
    void playWord(target.audio).catch(() => undefined);
    repeatRef.current = window.setTimeout(() => {
      if (!cancelled && !lockedRef.current && !gameOver) void playWord(target.audio).catch(() => undefined);
    }, 1700);
    return () => {
      cancelled = true;
      if (repeatRef.current !== null) {
        window.clearTimeout(repeatRef.current);
        repeatRef.current = null;
      }
    };
  }, [gameOver, paused, playWord, target.audio]);

  const nextRound = useCallback(() => {
    const next = pickWord(target.word);
    setRound((value) => value + 1);
    setTarget(next);
    setTargets(makeTargets(next));
    setLaser(null);
    setFeedback("Listen twice — blast the word with the bonus letter!");
    lockedRef.current = false;
    setBusy(false);
  }, [pickWord, target.word]);

  const scheduleNextRound = useCallback((delay: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pausedRef.current) return;
      nextRound();
    }, delay);
  }, [nextRound]);

  const damage = useCallback(async (message: string) => {
    if (lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
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
        setGameOver(true);
        setBusy(false);
      } else {
        scheduleNextRound(850);
      }
    }
  }, [gameOver, onRecord, scheduleNextRound]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(40, now - previous);
      previous = now;
      if (!paused && !lockedRef.current && !gameOver) {
        setTargets((current) => {
          const next = current.map((item) => item.status === "falling"
            ? { ...item, y: item.y + delta * (0.0075 + Math.min(round, 12) * 0.0006) }
            : item);
          const breached = next.find((item) => item.status === "falling" && item.y >= 83);
          if (breached) void damage("A decoy got through — listen and try the next one!");
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
    if (repeatRef.current !== null) window.clearTimeout(repeatRef.current);
  }, []);

  const fire = async (choice: BonusTarget) => {
    if (busy || paused || lockedRef.current || gameOver) return;
    ensureAudioContext();
    lockedRef.current = true;
    setBusy(true);
    if (choice.correct) {
      playLaser();
      const stage = stageRef.current?.getBoundingClientRect();
      const width = stage?.width ?? 360;
      const height = stage?.height ?? 560;
      const dx = (choice.x / 100) * width - width * 0.5;
      const dy = (choice.y / 100) * height - height * 0.86;
      setLaser({ id: Date.now(), angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) });
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "hit" } : item));
      setScore((value) => value + 15);
      setFeedback(`Direct hit! ${target.word} needs the bonus letter.`);
      try {
        await onRecord(true);
      } catch {
        // The round didn't save; keep playing rather than soft-locking.
      } finally {
        scheduleNextRound(650);
      }
    } else {
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "wrong" } : item));
      lockedRef.current = false;
      await damage(`That was the decoy. ${target.word} has the bonus letter.`);
    }
  };

  const togglePause = () => setPaused((value) => {
    pausedRef.current = !value;
    return !value;
  });

  const repair = () => {
    const next = pickWord();
    shieldsRef.current = 3;
    lockedRef.current = false;
    setRound(1);
    setTarget(next);
    setTargets(makeTargets(next));
    setShields(3);
    setScore(0);
    setFeedback("New mission — listen twice and blast the bonus letter!");
    setLaser(null);
    setPaused(false);
    pausedRef.current = false;
    setGameOver(false);
    setBusy(false);
  };

  return <>
    <header className="math-header bonus-header">
      <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
      <div className="math-title"><span>Bonus Letter</span><strong>Blast the bonus!</strong></div>
      <button className="math-pause" type="button" onClick={togglePause} disabled={gameOver} aria-label={paused ? "Resume game" : "Pause game"}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span><small>{paused ? "Resume" : "Pause"}</small></button>
      <div className="math-hud-block math-score-block"><span>Score</span><strong>{score}</strong><small>R{round}</small></div>
      <div className="math-hud-block shield-meter"><span>Shields</span><strong>{"◆".repeat(shields)}</strong></div>
      <button className="coin-purse math-shop" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><span className="coin coin-small">★</span><strong>{coins}</strong><small>SHOP</small></button>
    </header>
    <main className="math-main">
      <section ref={stageRef} className="math-stage bonus-stage" aria-labelledby="bonus-question">
        <div className="math-prompt"><span>Listen twice</span><h1 id="bonus-question">Find the bonus letter!</h1><p>{feedback}</p></div>
        {targets.map((item) => <button key={item.id} className={`bonus-word-target ${item.status}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} type="button" onPointerDown={() => void fire(item)} disabled={busy || gameOver || item.status !== "falling"} aria-label={`${item.label}, ${item.correct ? "correct" : "decoy"}`}><b>{item.label}</b></button>)}
        {laser && <span key={laser.id} className="math-laser" style={{ "--shot-angle": `${laser.angle}rad`, "--shot-distance": `${laser.distance}px` } as CSSProperties} aria-hidden="true" />}

        {paused && !gameOver && <div className="math-paused" role="status"><strong>PAUSED</strong><span>Tap resume when you’re ready.</span></div>}
        <div className="ship-deck"><div className="math-ship"><svg className="ship-flame" viewBox="0 0 112 56" aria-hidden="true"><defs><linearGradient id="shipFlameGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor="#ffda4d" /><stop offset=".7" stopColor="#ff743f" /><stop offset="1" stopColor="#ff743f" stopOpacity="0" /></linearGradient><linearGradient id="shipFlameCore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#ffedb0" /><stop offset="1" stopColor="#ffedb0" stopOpacity="0" /></linearGradient></defs><path d="M42,0 C42,14 17,15 0,22 C13,32 32,40 47,50 L56,56 L64,50 C80,40 99,32 112,22 C95,15 70,14 70,0 Z" fill="url(#shipFlameGrad)" /><path d="M48,3 C48,16 34,20 24,27 C32,33 43,37 51,42 L56,46 L61,42 C69,37 80,33 88,27 C78,20 64,16 64,3 Z" fill="url(#shipFlameCore)" /></svg><svg viewBox="0 0 120 86" role="presentation"><path d="M60 5 90 60H30Z" fill="#9fd8ff" stroke="#14213d" strokeWidth="6" /><path d="M31 60 8 78l9-29 21-3M89 60l23 18-9-29-21-3" fill="#4786c6" stroke="#14213d" strokeWidth="6" strokeLinejoin="round" /><path d="M60 24 75 58H45Z" fill="#eaf8ff" stroke="#14213d" strokeWidth="4" /><circle cx="60" cy="35" r="5" fill="#ff5a5f" /></svg></div></div>
        {gameOver && <div className="math-game-over" role="status"><strong>SHIP DOWN!</strong><span>Last word: {target.word}</span><span>Score: {score}</span><button type="button" onClick={repair}>Repair and play again</button></div>}
      </section>
      <div className="math-controls"><p>Correct word = 15 points. Wrong word = ship damage.</p><button type="button" onClick={() => { setPaused((value) => { pausedRef.current = !value; return !value; }); }}>{paused ? "▶ Resume" : "Ⅱ Pause"}</button></div>
    </main>
  </>;
}
