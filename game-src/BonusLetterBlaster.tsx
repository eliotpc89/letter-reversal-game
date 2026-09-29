import { useCallback, useEffect, useRef, useState } from "react";

export type BonusWord = { word: string; fake: string; audio: string };
type BonusTarget = { id: string; label: string; correct: boolean; x: number; y: number; status: "falling" | "hit" | "wrong" };
type BonusLetterBlasterProps = {
  coins: number;
  words: BonusWord[];
  onBack: () => void;
  onOpenShop: () => void;
  onRecord: (correct: boolean) => Promise<void>;
};

function shuffled<T>(values: readonly T[]): T[] { return [...values].sort(() => Math.random() - 0.5); }

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

function useWordAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audioRef.current?.pause(), []);
  return useCallback(async (src: string) => {
    if (!src) return;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = src;
    audio.preload = "auto";
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
  }, []);
}

export function BonusLetterBlaster({ coins, words, onBack, onOpenShop, onRecord }: BonusLetterBlasterProps) {
  const timerRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const lockedRef = useRef(false);
  const shieldsRef = useRef(3);
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState<BonusWord>(() => words[0] ?? { word: "puff", fake: "puf", audio: "" });
  const [targets, setTargets] = useState<BonusTarget[]>(() => makeTargets(words[0] ?? { word: "puff", fake: "puf", audio: "" }));
  const [shields, setShields] = useState(3);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("Listen twice — blast the word with the bonus letter!");
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const playWord = useWordAudio();

  const pickWord = useCallback((oldWord?: string) => {
    const choices = words.filter((item) => item.word !== oldWord);
    return shuffled(choices.length ? choices : words)[0] ?? { word: "puff", fake: "puf", audio: "" };
  }, [words]);

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
    await onRecord(false);
    if (nextShields === 0) {
      setGameOver(true);
      setBusy(false);
    } else {
      scheduleNextRound(850);
    }
  }, [gameOver, onRecord, scheduleNextRound]);

  useEffect(() => {
    if (paused || gameOver) return;
    const interval = window.setInterval(() => {
      if (lockedRef.current) return;
      setTargets((current) => {
        const next = current.map((item) => item.status === "falling" ? { ...item, y: item.y + 0.8 } : item);
        if (next.some((item) => item.status === "falling" && item.y >= 82)) void damage("A decoy got through — listen and try the next one!");
        return next;
      });
    }, 50);
    return () => window.clearInterval(interval);
  }, [damage, gameOver, paused]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (repeatRef.current !== null) window.clearTimeout(repeatRef.current);
  }, []);

  const fire = async (choice: BonusTarget) => {
    if (busy || paused || lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (choice.correct) {
      setTargets((current) => current.map((item) => item.id === choice.id ? { ...item, status: "hit" } : item));
      setScore((value) => value + 15);
      setFeedback(`Direct hit! ${target.word} needs the bonus letter.`);
      await onRecord(true);
      scheduleNextRound(650);
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
      <section className="math-stage bonus-stage" aria-labelledby="bonus-question">
        <div className="math-prompt"><span>Listen twice</span><h1 id="bonus-question">Find the bonus letter!</h1><p>{feedback}</p></div>
        {targets.map((item) => <button key={item.id} className={`bonus-word-target ${item.status}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} type="button" onPointerDown={() => void fire(item)} disabled={busy || gameOver || item.status !== "falling"} aria-label={`${item.label}, ${item.correct ? "correct" : "decoy"}`}><b>{item.label}</b><small>{item.correct ? "BONUS" : "DECOY"}</small></button>)}
        {paused && !gameOver && <div className="math-paused" role="status"><strong>PAUSED</strong><span>Tap resume when you’re ready.</span></div>}
        <div className="ship-deck"><div className="math-ship"><span className="ship-flame" /><svg viewBox="0 0 120 86" role="presentation"><path d="M60 5 90 60H30Z" fill="#9fd8ff" stroke="#14213d" strokeWidth="6" /><path d="M31 60 8 78l9-29 21-3M89 60l23 18-9-29-21-3" fill="#4786c6" stroke="#14213d" strokeWidth="6" strokeLinejoin="round" /><path d="M60 24 75 58H45Z" fill="#eaf8ff" stroke="#14213d" strokeWidth="4" /><circle cx="60" cy="35" r="5" fill="#ff5a5f" /></svg></div></div>
        {gameOver && <div className="math-game-over" role="status"><strong>SHIP DOWN!</strong><span>Last word: {target.word}</span><span>Score: {score}</span><button type="button" onClick={repair}>Repair and play again</button></div>}
      </section>
      <div className="math-controls"><p>Correct word = 15 points. Wrong word = ship damage.</p><button type="button" onClick={() => { setPaused((value) => { pausedRef.current = !value; return !value; }); }}>{paused ? "▶ Resume" : "Ⅱ Pause"}</button></div>
    </main>
  </>;
}
