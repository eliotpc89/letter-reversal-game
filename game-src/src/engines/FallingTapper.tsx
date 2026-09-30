import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ensureAudioContext } from "../kit/audio";
import { playDamage, playJackpot, playLaser, playShieldDown } from "../kit/sfx";
import { GameShell, type ShellVariant } from "../shell/GameShell";

/** One tappable falling item. `good` = tapping it is the correct move. */
export type TapTarget = {
  key: string;
  label: string;
  good: boolean;
};

/** Everything the engine needs for one round. */
export type Wave = {
  /** Shown in the prompt lane, e.g. the equation. */
  prompt: ReactNode;
  targets: TapTarget[];
};

type PlacedTarget = TapTarget & {
  x: number;
  y: number;
  status: "falling" | "hit" | "wrong" | "missed";
};

type Laser = { id: number; angle: number; distance: number };

export type FallingTapperProps = {
  shell: {
    variant: ShellVariant;
    eyebrow: string;
    title: string;
    coins: number;
    onBack: () => void;
    onOpenShop: () => void;
    fullscreenClass?: string;
  };
  promptKicker: string;
  introFeedback: string;
  nextWaveFeedback: string;
  hitFeedback: string;
  wrongFeedback: (wave: Wave, target: TapTarget) => string;
  breachFeedback: string;
  makeWave: (round: number) => Wave;
  /** Fraction of the stage height travelled per millisecond. */
  speedForRound: (round: number) => number;
  scoreForRound: (round: number) => number;
  targetAriaLabel?: (target: TapTarget) => string;
  /**
   * When true, only a `good` target breaching the ship line costs a shield;
   * other breaches drift away silently. (Math Blasters: false — any breach
   * hurts. Odd One Out: true — only the odd word escaping matters.)
   */
  onlyGoodBreachesHurt?: boolean;
  startLives?: number;
  controlsNote: ReactNode;
  gameOverTitle?: string;
  repairLabel?: string;
  onCorrect: () => Promise<void>;
  onWrong: () => Promise<void>;
  /**
   * When true, each consecutive correct answer grows the ship's flame and
   * the laser a little, up to a cap at 20 straight hits. Any damage resets
   * the growth. (Math Blasters: true.)
   */
  powerStreak?: boolean;
  /**
   * Flawless-streak bonus (Math Blasters): when powerStreak is on and the
   * player reaches `streakGoal` consecutive correct answers without taking
   * a hit, award `streakBonusCoins` bonus coins and end the run in victory.
   */
  streakGoal?: number;
  streakBonusCoins?: number;
  victoryTitle?: string;
  onStreakBonus?: (coins: number) => Promise<void>;
};

function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

/** Lane x-positions for a wave; 3 keeps Math Blasters' original spacing. */
function laneX(count: number): number[] {
  if (count === 3) return shuffled([22, 50, 78]);
  return shuffled(Array.from({ length: count }, (_, index) => ((index + 1) / (count + 1)) * 100));
}

function placeWave(wave: Wave): PlacedTarget[] {
  const xs = laneX(wave.targets.length);
  return wave.targets.map((target, index) => ({
    ...target,
    x: xs[index] ?? 50,
    // Keep every bubble below the prompt. They only move downward, so this
    // creates a protected prompt lane at the top of the playfield.
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

const BREACH_Y = 83;

export function FallingTapper(props: FallingTapperProps) {
  const {
    shell, promptKicker, introFeedback, nextWaveFeedback, hitFeedback,
    wrongFeedback, breachFeedback, makeWave, speedForRound, scoreForRound,
    onlyGoodBreachesHurt, startLives = 3, controlsNote,
    gameOverTitle = "SHIP DOWN!", repairLabel = "Repair and play again",
    onCorrect, onWrong, powerStreak = false,
    streakGoal = 20, streakBonusCoins = 100,
    victoryTitle = "FLAWLESS VICTORY!", onStreakBonus,
  } = props;
  const targetAriaLabel = props.targetAriaLabel ?? ((target) => `Target ${target.label}`);

  const stageRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const livesRef = useRef(startLives);
  const waveRef = useRef<Wave | null>(null);
  const pausedRef = useRef(false);
  const pendingNextRoundRef = useRef(false);
  const [round, setRound] = useState(1);
  const [wave, setWave] = useState<Wave>(() => {
    const first = makeWave(1);
    waveRef.current = first;
    return first;
  });
  const [targets, setTargets] = useState<PlacedTarget[]>(() => placeWave(waveRef.current ?? makeWave(1)));
  const [lives, setLives] = useState(startLives);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(introFeedback);
  const [laser, setLaser] = useState<Laser | null>(null);
  const [hitStreak, setHitStreak] = useState(0);
  const streakRef = useRef(0);
  const [victory, setVictory] = useState(false);
  const victoryRef = useRef(false);
  const [flashTick, setFlashTick] = useState(0);
  const power = powerStreak ? Math.min(hitStreak, streakGoal) / streakGoal : 0;
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);

  const nextRound = useCallback(() => {
    setRound((current) => {
      const next = current + 1;
      const nextWave = makeWave(next);
      waveRef.current = nextWave;
      setWave(nextWave);
      setTargets(placeWave(nextWave));
      setFeedback(nextWaveFeedback);
      setLaser(null);
      lockedRef.current = false;
      setBusy(false);
      return next;
    });
  }, [makeWave, nextWaveFeedback]);

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

  const awardVictory = useCallback(async () => {
    victoryRef.current = true;
    setVictory(true);
    if (soundOn) playJackpot();
    setFeedback(`Flawless! ${streakGoal} in a row — bonus coins!`);
    try {
      await onStreakBonus?.(streakBonusCoins);
    } catch {
      // The bonus didn't save; the victory still counts.
    } finally {
      setGameOver(true);
      setBusy(false);
    }
  }, [onStreakBonus, soundOn, streakBonusCoins, streakGoal]);

  const damage = useCallback(async (message: string) => {
    if (lockedRef.current || gameOver) return;
    lockedRef.current = true;
    setBusy(true);
    if (soundOn) playDamage();
    setFeedback(message);
    setFlashTick((tick) => tick + 1);
    const nextLives = Math.max(0, livesRef.current - 1);
    livesRef.current = nextLives;
    setLives(nextLives);
    try {
      await onWrong();
    } catch {
      // The round didn't save; keep playing rather than soft-locking.
    } finally {
      if (nextLives === 0) {
        if (soundOn) playShieldDown();
        setGameOver(true);
        setBusy(false);
      } else {
        scheduleNextRound(850);
      }
    }
  }, [gameOver, nextRound, onWrong, scheduleNextRound, soundOn]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const speed = speedForRound(round);
    const tick = (now: number) => {
      const delta = Math.min(40, now - previous);
      previous = now;
      if (!paused && !lockedRef.current && !gameOver) {
        setTargets((current) => {
          const next = current.map((target) => target.status === "falling"
            ? { ...target, y: target.y + delta * speed }
            : target);
          const hurting = next.find((target) =>
            target.status === "falling" && target.y >= BREACH_Y &&
            (!onlyGoodBreachesHurt || target.good));
          if (hurting) {
            void damage(breachFeedback);
            return next;
          }
          if (onlyGoodBreachesHurt) {
            const cleared = next.filter((target) =>
              !(target.status === "falling" && target.y >= BREACH_Y));
            if (cleared.length !== next.length) return cleared;
          }
          return next;
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [breachFeedback, damage, gameOver, onlyGoodBreachesHurt, paused, round, speedForRound]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const fire = async (target: PlacedTarget) => {
    if (busy || paused || lockedRef.current || gameOver) return;
    ensureAudioContext();
    lockedRef.current = true;
    setBusy(true);
    const wave = waveRef.current;
    if (target.good) {
      if (soundOn) playLaser();
      const stage = stageRef.current?.getBoundingClientRect();
      const width = stage?.width ?? 360;
      const height = stage?.height ?? 560;
      const dx = (target.x / 100) * width - width * 0.5;
      const dy = (target.y / 100) * height - height * 0.86;
      setLaser({ id: Date.now(), angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) });
      setTargets((current) => current.map((item) => item.key === target.key ? { ...item, status: "hit" } : item));
      setFeedback(hitFeedback);
      const nextStreak = powerStreak ? Math.min(streakRef.current + 1, streakGoal) : 0;
      streakRef.current = nextStreak;
      setHitStreak(nextStreak);
      setScore((value) => value + scoreForRound(round));
      try {
        await onCorrect();
      } catch {
        // The round didn't save; keep playing rather than soft-locking.
      } finally {
        if (powerStreak && nextStreak >= streakGoal && !victoryRef.current) {
          void awardVictory();
        } else {
          scheduleNextRound(650);
        }
      }
    } else {
      setTargets((current) => current.map((item) => item.key === target.key ? { ...item, status: "wrong" } : item));
      lockedRef.current = false;
      await damage(wrongFeedback(wave ?? { prompt: "", targets: [] }, target));
    }
  };

  const togglePause = () => setPaused((value) => {
    pausedRef.current = !value;
    return !value;
  });

  const repair = () => {
    const first = makeWave(1);
    waveRef.current = first;
    livesRef.current = startLives;
    lockedRef.current = false;
    pausedRef.current = false;
    pendingNextRoundRef.current = false;
    setRound(1);
    setWave(first);
    setTargets(placeWave(first));
    setLives(startLives);
    setScore(0);
    setFeedback(introFeedback);
    setLaser(null);
    streakRef.current = 0;
    setHitStreak(0);
    victoryRef.current = false;
    setVictory(false);
    setFlashTick(0);
    setGameOver(false);
    setBusy(false);
    setPaused(false);
  };

  const hud = <>
    <div className="math-hud-block math-score-block"><span>Score</span><strong>{score}</strong><small>R{round}</small></div>
    <div className="math-hud-block shield-meter"><span>Shields</span><strong>{Array.from({ length: startLives }, (_, pip) => <i key={pip} className={pip < lives ? "active" : ""}>◆</i>)}</strong></div>
    {powerStreak && <div className="math-hud-block streak-meter"><span>Bonus</span><div className="streak-bar" role="progressbar" aria-valuenow={hitStreak} aria-valuemin={0} aria-valuemax={streakGoal} aria-label={`${hitStreak} of ${streakGoal} correct toward the 200-coin bonus`}><i style={{ width: `${(hitStreak / streakGoal) * 100}%` }} /></div><small>{hitStreak}/{streakGoal}</small></div>}
  </>;

  const pauseButton = <button className="math-pause" type="button" onClick={togglePause} disabled={gameOver} aria-label={paused ? "Resume game" : "Pause game"}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span><small>{paused ? "Resume" : "Pause"}</small></button>;

  return <GameShell
    variant={shell.variant}
    eyebrow={shell.eyebrow}
    title={shell.title}
    coins={shell.coins}
    onBack={shell.onBack}
    onOpenShop={shell.onOpenShop}
    hud={hud}
    action={pauseButton}
    fullscreenClass={shell.fullscreenClass}
  >
    <main className="math-main">
      <section ref={stageRef} className="math-stage" aria-labelledby="tap-prompt" style={{ "--power": power, "--dmg": startLives - lives } as CSSProperties}>
        <div className="math-stars" aria-hidden="true" />
        <div className="math-prompt"><span>{promptKicker}</span><h1 id="tap-prompt">{wave.prompt}</h1><p>{feedback}</p></div>
        {targets.map((target) => <button
          key={target.key}
          className={`answer-target ${target.status}`}
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
          type="button"
          onPointerDown={() => void fire(target)}
          disabled={busy || gameOver || target.status !== "falling"}
          aria-label={targetAriaLabel(target)}
        >{target.label}</button>)}
        {laser && <span key={laser.id} className="math-laser" style={{ "--shot-angle": `${laser.angle}rad`, "--shot-distance": `${laser.distance}px` } as CSSProperties} aria-hidden="true" />}
        <div className="ship-deck"><Spaceship /></div>
        <div className="damage-vignette" aria-hidden="true" />
        {flashTick > 0 && <div key={flashTick} className="damage-flash" aria-hidden="true" />}
        {paused && !gameOver && <div className="math-paused" role="status"><strong>PAUSED</strong><span>Tap resume when you’re ready.</span></div>}
        {gameOver && <div className="math-game-over" role="status"><strong>{victory ? victoryTitle : gameOverTitle}</strong>{victory && <span className="victory-bonus">Bonus: +{streakBonusCoins} coins!</span>}<span>Score: {score}</span><button type="button" onClick={repair}>{repairLabel}</button></div>}
      </section>
      <div className="math-controls"><p>{controlsNote}</p><button type="button" onClick={() => setSoundOn((value) => !value)}>{soundOn ? "🔊 Sounds on" : "🔇 Sounds off"}</button></div>
    </main>
  </GameShell>;
}
