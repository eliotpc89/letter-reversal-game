// One synthesized-SFX kit for every game.
//
// Each effect keeps its original recipe (Miles knows these sounds); the only
// change is that they all share one AudioContext lifecycle instead of each
// game file rolling its own oscillator boilerplate.

import { ensureAudioContext } from "./audio";

type Ctx = AudioContext | null | undefined;

function running(context: Ctx): context is AudioContext {
  return !!context && context.state === "running";
}

function tone(
  context: AudioContext,
  opts: {
    type: OscillatorType;
    from: number;
    to?: number;
    at?: number;
    dur: number;
    vol: number;
  },
) {
  const start = context.currentTime + (opts.at ?? 0);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = opts.type;
  oscillator.frequency.setValueAtTime(opts.from, start);
  if (opts.to !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(opts.to, start + opts.dur);
  } else {
    oscillator.frequency.value = opts.from;
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(opts.vol, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + opts.dur + 0.02);
}

/** Correct answer in the practice games. */
export function playJackpot(context?: Ctx) {
  const ctx = context ?? ensureAudioContext();
  if (!running(ctx)) return;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((frequency, index) => {
    tone(ctx, {
      type: index % 2 ? "triangle" : "square",
      from: frequency,
      at: index * 0.085,
      dur: 0.34,
      vol: 0.16,
    });
  });
}

/** Wrong answer in the practice games. */
export function playWhomp(context?: Ctx) {
  const ctx = context ?? ensureAudioContext();
  if (!running(ctx)) return;
  tone(ctx, { type: "sawtooth", from: 190, to: 105, dur: 0.3, vol: 0.14 });
  tone(ctx, { type: "sawtooth", from: 150, to: 76, at: 0.34, dur: 0.3, vol: 0.14 });
}

/** Laser fired at a falling target. */
export function playLaser(context?: Ctx) {
  const ctx = context ?? ensureAudioContext();
  if (!running(ctx)) return;
  tone(ctx, { type: "square", from: 1500, to: 240, dur: 0.2, vol: 0.13 });
}

/** Ship takes damage. */
export function playDamage(context?: Ctx) {
  const ctx = context ?? ensureAudioContext();
  if (!running(ctx)) return;
  tone(ctx, { type: "sawtooth", from: 180, to: 55, dur: 0.38, vol: 0.16 });
}

/** All shields gone — game over sting. */
export function playShieldDown(context?: Ctx) {
  const ctx = context ?? ensureAudioContext();
  if (!running(ctx)) return;
  [130, 98, 65].forEach((frequency, index) => {
    tone(ctx, { type: "triangle", from: frequency, at: index * 0.08, dur: 0.18, vol: 0.11 });
  });
}

/** Small UI pop (button presses, tile flips). */
export function playPop(context?: Ctx) {
  const ctx = context ?? ensureAudioContext();
  if (!running(ctx)) return;
  tone(ctx, { type: "sine", from: 660, to: 990, dur: 0.09, vol: 0.12 });
}
