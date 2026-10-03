import { Fragment, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAudioClip } from "../kit/useAudioClip";
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
  /** Optional spoken prompt, repeated halfway through the falling wave. */
  audio?: string;
};

type PlacedTarget = TapTarget & {
  x: number;
  y: number;
  status: "falling" | "hit" | "wrong" | "missed" | "revealed";
};

type Laser = { id: number; angle: number; distance: number; x: number; y: number };

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
   * When true, a wrong tap floats the correct target to the middle of the
   * stage with a gold glow and holds the wave for `wrongPauseMs` so the
   * player sees the right answer. (Math Blasters: true.)
   */
  revealCorrectOnWrong?: boolean;
  /**
   * How long the wave holds after a wrong tap before the next round, in ms.
   * Defaults to the historical 850.
   */
  wrongPauseMs?: number;
  /**
   * Optional audio for a wrong tap: return the URL of a clip to play shortly
   * after the tap (e.g. Math Blasters' recorded equation reading). Respects
   * the sound toggle. Return null for no clip.
   */
  wrongAudio?: (wave: Wave, target: TapTarget) => string | null;
  /**
   * When true, each shot grows the ship's flame and laser, up to 20 shots.
   * Repair resets visual power; bonus progress still counts correct answers.
   */
  powerStreak?: boolean;
  /**
   * Bonus-goal (Math Blasters): when powerStreak is on and the player reaches
   * `streakGoal` correct answers in a run, award `streakBonusCoins` bonus
   * coins and end the run in victory. Hits don't reset the counter; it
   * resets only when the ship goes down (all shields break).
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
    <svg className="ship-flame" viewBox="0 0 112 56" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="shipFlameGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".35" stopColor="#ffda4d" />
          <stop offset=".7" stopColor="#ff743f" />
          <stop offset="1" stopColor="#ff743f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="shipFlameCore" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".6" stopColor="#ffedb0" />
          <stop offset="1" stopColor="#ffedb0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M42,0 C42,14 17,15 0,22 C13,32 32,40 47,50 L56,56 L64,50 C80,40 99,32 112,22 C95,15 70,14 70,0 Z" fill="url(#shipFlameGrad)" />
      <path d="M48,3 C48,16 34,20 24,27 C32,33 43,37 51,42 L56,46 L61,42 C69,37 80,33 88,27 C78,20 64,16 64,3 Z" fill="url(#shipFlameCore)" />
    </svg>
    <svg viewBox="0 0 120 86" role="presentation">
      <path d="M60 5 90 60H30Z" fill="#9fd8ff" stroke="#14213d" strokeWidth="6" />
      <path d="M31 60 8 78l9-29 21-3M89 60l23 18-9-29-21-3" fill="#4786c6" stroke="#14213d" strokeWidth="6" strokeLinejoin="round" />
      <path d="M60 24 75 58H45Z" fill="#eaf8ff" stroke="#14213d" strokeWidth="4" />
      <circle cx="60" cy="35" r="5" fill="#ff5a5f" />
    </svg>
  </div>;
}

const BREACH_Y = 83;

/**
 * Swap the prompt's "?" for the revealed answer, styled gold. The prompt can
 * be a string, a number, an array of parts, or a JSX element (math renders
 * <>{left} {op} {right} = ?</>), so this walks the node tree and replaces
 * every "?".
 */
function injectAnswer(node: ReactNode, answer: string): ReactNode {
  if (typeof node === "string" || typeof node === "number") {
    const text = String(node);
    if (!text.includes("?")) return node;
    const parts = text.split("?");
    return (
      <>
        {parts.map((part, i) => (
          <Fragment key={i}>
            {part}
            {i < parts.length - 1 && <span className="prompt-answer-gold">{answer}</span>}
          </Fragment>
        ))}
      </>
    );
  }
  if (Array.isArray(node)) {
    return (
      <>
        {node.map((child, i) => (
          <Fragment key={i}>{injectAnswer(child, answer)}</Fragment>
        ))}
      </>
    );
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, { ...node.props, children: injectAnswer(node.props.children, answer) });
  }
  return node;
}

/**
 * Global fall-speed scale for every falling-targets game (Math Blasters, Odd
 * One Out via this engine, plus Sound Blaster and Bonus Blaster which run
 * their own loops but import this). 0.75 = 25% slower than the per-game tuned
 * speeds. One knob on purpose: the games must not drift apart.
 */
export const FALL_SPEED_SCALE = 0.75;

export function FallingTapper(props: FallingTapperProps) {
  const {
    shell, promptKicker, introFeedback, nextWaveFeedback, hitFeedback,
    wrongFeedback, breachFeedback, makeWave, speedForRound, scoreForRound,
    onlyGoodBreachesHurt, startLives = 3, controlsNote,
    gameOverTitle = "SHIP DOWN!", repairLabel = "Repair and play again",
    onCorrect, onWrong, powerStreak = false,
    streakGoal = 20, streakBonusCoins = 100,
    victoryTitle = "BONUS UNLOCKED!", onStreakBonus,
    revealCorrectOnWrong = false, wrongPauseMs = 850, wrongAudio,
  } = props;
  const targetAriaLabel = props.targetAriaLabel ?? ((target) => `Target ${target.label}`);
  const wrongAudioRef = useRef(wrongAudio);
  wrongAudioRef.current = wrongAudio;

  /** Fire the ship's laser visual + pew at a tapped target. */
  const fireLaserAt = (target: PlacedTarget) => {
    if (soundOn) playLaser();
    const stage = stageRef.current?.getBoundingClientRect();
    const width = stage?.width ?? 360;
    const height = stage?.height ?? 560;
    const ship = stageRef.current?.querySelector(".math-ship svg:not(.ship-flame)")?.getBoundingClientRect();
    const x = ship && stage ? ship.left + ship.width / 2 - stage.left : width * 0.5;
    const y = ship && stage ? ship.top + 5 - stage.top : height * 0.86;
    const dx = (target.x / 100) * width - x;
    const dy = (target.y / 100) * height - y;
    if (powerStreak) setShotCount((count) => Math.min(count + 1, 20));
    setLaser({ id: Date.now(), angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy), x, y });
  };

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
  const [shotCount, setShotCount] = useState(0);
  const streakRef = useRef(0);
  const [victory, setVictory] = useState(false);
  const victoryRef = useRef(false);
  const [flashTick, setFlashTick] = useState(0);
  const power = powerStreak ? Math.sqrt(shotCount / 20) : 0;
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  // Wrong-answer reveal choreography (Math Blasters): the correct bubble glows
  // gold and flies to the "?" glyph, the equation morphs "?" into the gold
  // answer, and the bubble dissolves into it on arrival.
  const [revealPos, setRevealPos] = useState<{ left: string; top: string } | null>(null);
  const [revealAnswer, setRevealAnswer] = useState<string | null>(null);
  const [absorbed, setAbsorbed] = useState(false);
  const absorbTimers = useRef<number[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const playClip = useAudioClip();
  const revealAudioTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!wave.audio || paused || gameOver || busy || !soundOn) return;
    void playClip(wave.audio).catch(() => {});
    const speed = speedForRound(round) * FALL_SPEED_SCALE;
    const halfwayMs = Math.max(1200, Math.round(((BREACH_Y - 27) / speed) / 2));
    const timer = window.setTimeout(() => {
      if (!lockedRef.current && !pausedRef.current) void playClip(wave.audio!).catch(() => {});
    }, halfwayMs);
    return () => { window.clearTimeout(timer); playClip.stop(); };
  }, [wave, round, paused, gameOver, busy, soundOn, playClip, speedForRound]);

  useEffect(() => {
    if (paused || !soundOn) {
      if (revealAudioTimerRef.current !== null) window.clearTimeout(revealAudioTimerRef.current);
      revealAudioTimerRef.current = null;
      playClip.stop();
    }
  }, [paused, soundOn, playClip]);

  const nextRound = useCallback(() => {
    setRound((current) => {
      const next = current + 1;
      const nextWave = makeWave(next);
      waveRef.current = nextWave;
      setWave(nextWave);
      setTargets(placeWave(nextWave));
      setFeedback(nextWaveFeedback);
      setLaser(null);
      setRevealPos(null);
      setRevealAnswer(null);
      setAbsorbed(false);
      absorbTimers.current.forEach((id) => window.clearTimeout(id));
      absorbTimers.current = [];
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
    setFeedback(`Bonus goal! ${streakGoal} correct — bonus coins!`);
    try {
      await onStreakBonus?.(streakBonusCoins);
    } catch {
      // The bonus didn't save; the victory still counts.
    } finally {
      setGameOver(true);
      setBusy(false);
    }
  }, [onStreakBonus, soundOn, streakBonusCoins, streakGoal]);

  const damage = useCallback(async (message: string, pauseMs: number = 850) => {
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
        scheduleNextRound(pauseMs);
      }
    }
  }, [gameOver, nextRound, onWrong, scheduleNextRound, soundOn]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const speed = speedForRound(round) * FALL_SPEED_SCALE;
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
    absorbTimers.current.forEach((id) => window.clearTimeout(id));
    if (revealAudioTimerRef.current !== null) window.clearTimeout(revealAudioTimerRef.current);
    playClip.stop();
  }, [playClip]);

  const fire = async (target: PlacedTarget) => {
    if (busy || paused || lockedRef.current || gameOver) return;
    ensureAudioContext();
    lockedRef.current = true;
    setBusy(true);
    const wave = waveRef.current;
    if (target.good) {
      fireLaserAt(target);
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
      // Every tap fires the ship's laser (visual + pew) — including wrong answers.
      fireLaserAt(target);
      // Wrong-answer audio (e.g. the recorded equation reading): play shortly
      // after the tap so the pew lands first and the words track the reveal.
      const equationUrl = wave ? wrongAudioRef.current?.(wave, target) ?? null : null;
      if (equationUrl && soundOn) {
        if (revealAudioTimerRef.current !== null) window.clearTimeout(revealAudioTimerRef.current);
        revealAudioTimerRef.current = window.setTimeout(() => {
          revealAudioTimerRef.current = null;
          if (!pausedRef.current) void playClip(equationUrl).catch(() => {});
        }, 350);
      }
      // Reveal choreography: the correct bubble glows gold and flies to the
      // "?" glyph; mid-flight the equation morphs "?" into the gold answer;
      // on arrival the bubble dissolves into it.
      if (revealCorrectOnWrong) {
        const good = targets.find((item) => item.good && item.status === "falling");
        if (good) {
          // Measure the "?" glyph: the prompt renders as several adjacent
          // text nodes (e.g. "7"," ","+"," ","1"," = ?"), so scan for the
          // last non-blank text node and take its final character.
          try {
            const stageEl = stageRef.current;
            const h1 = stageEl?.querySelector("#tap-prompt");
            const sample = stageEl?.querySelector(".answer-target");
            if (stageEl && h1 && sample) {
              const stageBox = stageEl.getBoundingClientRect();
              const sampleBox = sample.getBoundingClientRect();
              let gx = 0, gy = 0, gw = 0, gh = 0, found = false;
              const textNodes: Text[] = [];
              h1.childNodes.forEach((n) => {
                if (n.nodeType === Node.TEXT_NODE && n.textContent) textNodes.push(n as Text);
              });
              for (let i = textNodes.length - 1; i >= 0; i--) {
                const node = textNodes[i];
                const t = node?.textContent ?? "";
                if (!node || t.trim().length === 0) continue;
                const range = document.createRange();
                range.setStart(node, t.length - 1);
                range.setEnd(node, t.length);
                const gr = range.getBoundingClientRect();
                gx = gr.left; gy = gr.top; gw = gr.width; gh = gr.height; found = true;
                break;
              }
              if (!found) {
                const hr = h1.getBoundingClientRect();
                gx = hr.right - hr.height * 0.7; gy = hr.top; gw = hr.height * 0.7; gh = hr.height;
              }
              if (stageBox.width > 0 && stageBox.height > 0 && sampleBox.height > 0) {
                const cx = gx + gw / 2;
                const cy = gy + gh / 2;
                const leftPct = (cx - stageBox.left) / stageBox.width * 100;
                // .answer-target uses translate(-50%, 0): left is the center, top is the top edge.
                const topPct = (cy - stageBox.top - sampleBox.height / 2) / stageBox.height * 100;
                const clampPct = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
                setRevealPos({
                  left: `${clampPct(leftPct, 5, 95).toFixed(1)}%`,
                  top: `${clampPct(topPct, 1, 85).toFixed(1)}%`,
                });
              }
            }
          } catch {
            // No measured anchor: the bubble just glows in place.
          }
          const label = good.label;
          absorbTimers.current.push(window.setTimeout(() => setRevealAnswer(label), 260));
          absorbTimers.current.push(window.setTimeout(() => setAbsorbed(true), 400));
        }
      }
      setTargets((current) => current.map((item) => {
        if (item.key === target.key) return { ...item, status: "wrong" as const };
        if (revealCorrectOnWrong && item.good && item.status === "falling") return { ...item, status: "revealed" as const };
        return item;
      }));
      lockedRef.current = false;
      await damage(wrongFeedback(wave ?? { prompt: "", targets: [] }, target), wrongPauseMs);
    }
  };

  const togglePause = () => setPaused((value) => {
    pausedRef.current = !value;
    return !value;
  });

  const repair = () => {
    if (revealAudioTimerRef.current !== null) window.clearTimeout(revealAudioTimerRef.current);
    revealAudioTimerRef.current = null;
    playClip.stop();
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
    setShotCount(0);
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
    {powerStreak && <div className="math-hud-block streak-meter"><span>Bonus</span><div className="streak-bar" role="progressbar" aria-valuenow={hitStreak} aria-valuemin={0} aria-valuemax={streakGoal} aria-label={`${hitStreak} of ${streakGoal} correct toward the ${streakBonusCoins}-coin bonus`}><i style={{ width: `${(hitStreak / streakGoal) * 100}%` }} /></div><small>{hitStreak}/{streakGoal}</small></div>}
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
      <section ref={stageRef} className={`math-stage${revealPos || revealAnswer ? " reveal-focus" : ""}`} aria-labelledby="tap-prompt" style={{ "--power": power, "--dmg": startLives - lives } as CSSProperties}>
        <div className="math-stars" aria-hidden="true" />
        <div className="math-prompt"><span>{promptKicker}</span><h1 id="tap-prompt" className={revealAnswer ? "answered" : ""}>{revealAnswer ? injectAnswer(wave.prompt, revealAnswer) : wave.prompt}</h1><p>{feedback}</p></div>
        {targets.map((target) => <button
          key={target.key}
          className={`answer-target ${target.status}${target.status === "revealed" && absorbed ? " absorbed" : ""}`}
          style={target.status === "revealed" && revealPos
            ? { left: revealPos.left, top: revealPos.top }
            : { left: `${target.x}%`, top: `${target.y}%` }}
          type="button"
          onPointerDown={() => void fire(target)}
          disabled={busy || gameOver || target.status !== "falling"}
          aria-label={targetAriaLabel(target)}
        >{target.label}</button>)}
        {laser && <span key={laser.id} className="math-laser" style={{ left: laser.x, top: laser.y, "--shot-angle": `${laser.angle}rad`, "--shot-distance": `${laser.distance}px` } as CSSProperties} aria-hidden="true" />}
        <div className="ship-deck"><Spaceship /></div>
        <div className="damage-vignette" aria-hidden="true" />
        {flashTick > 0 && <div key={flashTick} className="damage-flash" aria-hidden="true" />}
        {paused && !gameOver && <div className="math-paused" role="status"><strong>PAUSED</strong><span>Tap resume when you’re ready.</span></div>}
        {gameOver && <div className="math-game-over" role="status"><strong>{victory ? victoryTitle : gameOverTitle}</strong>{victory && <span className="victory-bonus">Bonus: +{streakBonusCoins} coins!</span>}<span>Score: {score}</span><button type="button" onClick={repair}>{repairLabel}</button></div>}
      </section>
      <div className="math-controls"><p>{controlsNote}</p><button type="button" onClick={() => { if (!soundOn) ensureAudioContext(); setSoundOn((value) => !value); }}>{soundOn ? "🔊 Sounds on" : "🔇 Sounds off"}</button></div>
    </main>
  </GameShell>;
}
