import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { classifyDrawing, isConfidentMatch, LETTERS, type Letter } from "../draw-classifier";
import { CoinIcon, SpeakerIcon } from "../icons";
import { ensureAudioContext } from "../kit/audio";
import { GameShell } from "../shell/GameShell";
import { TrophyCase } from "../platform/TrophyCase";
import { Scoreboard } from "../platform/Scoreboard";
import type { GameContext, Verdict } from "./types";
import bSound from "../assets/letters/b.mp3";
import dSound from "../assets/letters/d.mp3";
import pSound from "../assets/letters/p.mp3";
import qSound from "../assets/letters/q.mp3";
import nSound from "../assets/letters/n.mp3";
import uSound from "../assets/letters/u.mp3";
import cSound from "../assets/letters/c.mp3";
import kSound from "../assets/letters/k.mp3";

const SOUNDS: Record<Letter, string> = { b: bSound, d: dSound, p: pSound, q: qSound, n: nSound, u: uSound, c: cSound, k: kSound };

function pickLetter(previous?: Letter): Letter {
  const pool = LETTERS.filter((letter) => letter !== previous);
  return pool[Math.floor(Math.random() * pool.length)] ?? "b";
}

function drawingContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#14213d";
  ctx.fillStyle = "#14213d";
  ctx.lineWidth = 28;
  return ctx;
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d");
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * The flagship b__d drawing game. Stays bespoke: canvas drawing, the
 * template classifier, and the trophy case / scoreboard live here.
 */
export function BedGame({ state, coins, onBack, onOpenShop, recordLetter, onReset, resetting }: GameContext) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceBuffersRef = useRef<Partial<Record<Letter, AudioBuffer>>>({});
  const [target, setTarget] = useState<Letter>(() => pickLetter());
  const [hasInk, setHasInk] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [heard, setHeard] = useState(false);
  const [audioProblem, setAudioProblem] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    drawingContext(canvasRef.current);
  }, []);

  const playLetter = useCallback(async () => {
    setAudioProblem(false);
    const ctx = ensureAudioContext();

    if (ctx) {
      try {
        await ctx.resume();
        let buffer = voiceBuffersRef.current[target];
        if (!buffer) {
          const response = await fetch(SOUNDS[target]);
          if (!response.ok) throw new Error("Letter audio could not be loaded");
          buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          voiceBuffersRef.current[target] = buffer;
        }
        try { voiceSourceRef.current?.stop(); } catch { /* The previous clip already ended. */ }
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        gain.gain.value = 1.6;
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 6;
        source.buffer = buffer;
        source.connect(gain).connect(compressor).connect(ctx.destination);
        source.start();
        voiceSourceRef.current = source;
        setHeard(true);
        return;
      } catch {
        // Fall through to the attached audio element for browsers without MP3 decoding in Web Audio.
      }
    }

    const audio = fallbackAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        await audio.play();
        setHeard(true);
        return;
      } catch {
        // The final speech fallback is useful in restrictive embedded browsers.
      }
    }

    if ("speechSynthesis" in window) {
      const names: Record<Letter, string> = { b: "bee", d: "dee", p: "pee", q: "cue", n: "en", u: "you", c: "cee", k: "kay" };
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(names[target]);
      utterance.rate = 0.78;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
      setHeard(true);
      return;
    }

    setAudioProblem(true);
  }, [target]);

  const clear = useCallback(() => {
    clearCanvas(canvasRef.current);
    setHasInk(false);
    setVerdict(null);
  }, []);

  const nextRound = useCallback(() => {
    setTarget((old) => pickLetter(old));
    setHeard(false);
    clearCanvas(canvasRef.current);
    setHasInk(false);
    setVerdict(null);
  }, []);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };

  const beginDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (verdict || checking) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    const ctx = drawingContext(canvasRef.current);
    if (ctx) { ctx.beginPath(); ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    setHasInk(true);
  };

  const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || verdict || checking) return;
    const point = pointFromEvent(event);
    const last = lastPointRef.current;
    const ctx = drawingContext(canvasRef.current);
    if (!point || !last || !ctx) return;
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(point.x, point.y); ctx.stroke();
    lastPointRef.current = point;
  };

  const endDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const check = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || verdict || checking) return;
    ensureAudioContext();
    const match = classifyDrawing(canvas);
    if (!match || !isConfidentMatch(match.score)) {
      setVerdict("retry"); // too far from every template: redraw, no coins change
      return;
    }
    const correct = match.letter === target;
    setChecking(true);
    setSaveError(false);
    try {
      await recordLetter(target, correct);
      setVerdict(correct ? "correct" : "wrong");
    } catch {
      setSaveError(true);
    } finally {
      setChecking(false);
    }
  };

  return <GameShell variant="bed" eyebrow="" title="" coins={coins} onBack={onBack} onOpenShop={onOpenShop} action={<>
    <button className={`sound-button ${heard ? "heard" : ""}`} type="button" onClick={() => void playLetter()} aria-label="Play the letter name">
      <SpeakerIcon />
      <span>{heard ? "Hear it again" : "Tap to hear"}</span>
    </button>
    <audio ref={fallbackAudioRef} src={SOUNDS[target]} preload="auto" />
  </>}>
    <main className="game-main">
      {audioProblem && <p className="audio-note" role="alert">Sound is blocked. Turn up the phone volume, then tap the red button again.</p>}
      <div className="instruction"><span className="step-dot">1</span><span>Listen</span><span className="step-line" /><span className="step-dot">2</span><span>Draw it</span></div>

      <section className={`draw-stage ${verdict ?? ""}`} aria-label="Letter drawing area">
        <canvas ref={canvasRef} width={700} height={590} className="drawing-canvas" aria-label="Drawing pad" onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw} />
        {!hasInk && <div className="draw-hint" aria-hidden="true"><span>Draw here</span><span className="finger-trail">⌁</span></div>}
        {verdict && <div className={`verdict ${verdict}`} role="status">
          {verdict === "correct" ? <><div className="burst"><CoinIcon /><CoinIcon /><CoinIcon /></div><strong>JACKPOT!</strong><span>+5 coins</span></> :
            verdict === "wrong" ? <><strong>WHOMP WHOMP</strong><span>−3 coins</span></> :
            <><strong>Hmm, try again!</strong><span>That doesn&apos;t look like a letter yet. No coins lost.</span></>}
        </div>}
        <button className="clear-button" type="button" onClick={clear} disabled={!hasInk || !!verdict || checking} aria-label="Clear drawing">Clear</button>
      </section>

      {saveError && <p className="error-note" role="alert">That round didn’t save. Tap “Check it!” to try again.</p>}
      {!verdict ? <button className="check-button" type="button" onClick={() => void check()} disabled={!hasInk || checking}>{checking ? "Checking…" : "Check it!"}</button> :
        verdict === "retry" ? <button className="next-button" type="button" onClick={clear}>Try again <span aria-hidden="true">→</span></button> :
        <button className="next-button" type="button" onClick={nextRound}>Next letter <span aria-hidden="true">→</span></button>}
      <TrophyCase owned={state.unlockedTrophies} onOpen={onOpenShop} />
      <Scoreboard state={state} onReset={onReset} resetting={resetting} />
    </main>
  </GameShell>;
}
