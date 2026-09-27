// Threshold calibration for the drawing-game match gate.
//
// Compares the same maskScore() metric the game uses, over two groups:
//   - ACCEPT: messy but genuine letter attempts (right or wrong letter),
//     scored against their CLOSEST template exactly like the game does.
//     These must be graded, never rejected.
//   - REJECT: dots, straight lines, random scribbles, scored against their
//     closest template. These must be rejected ("try again", no coins).
//
// The exploit to kill is garbage earning coins; a false reject only costs
// the kid a redraw with no coins lost, so the threshold is biased strict:
// just under the best-scoring garbage.
//
// Run:  bun scripts/calibrate.mjs
// The suggested MATCH_REJECT_SCORE goes into src/draw-classifier.ts.

import { maskScore } from "../src/draw-classifier.ts";

const SIZE = 52;

function blank() {
  return new Uint8Array(SIZE * SIZE);
}
function setPx(m, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) m[y * SIZE + x] = 1;
}
function vbar(m, x, y0, y1, w = 4) {
  for (let y = y0; y <= y1; y++) for (let dx = -w / 2; dx <= w / 2; dx++) setPx(m, x + dx, y);
}
function hbar(m, y, x0, x1, w = 4) {
  for (let x = x0; x <= x1; x++) for (let dy = -w / 2; dy <= w / 2; dy++) setPx(m, x, y + dy);
}
function line(m, x0, y0, x1, y1, w = 4) {
  const steps = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    for (let dx = -w / 2; dx <= w / 2; dx++) for (let dy = -w / 2; dy <= w / 2; dy++) setPx(m, x + dx, y + dy);
  }
}
function ring(m, cx, cy, r, w = 4, a0 = 0, a1 = Math.PI * 2) {
  for (let a = a0; a <= a1; a += 0.05) {
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    for (let dx = -w / 2; dx <= w / 2; dx++) for (let dy = -w / 2; dy <= w / 2; dy++) setPx(m, x + dx, y + dy);
  }
}
function disk(m, cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(m, x, y);
  }
}

// Rough lowercase letter shapes on the 52x52 grid.
function letterShape(ch) {
  const m = blank();
  switch (ch) {
    case "b": vbar(m, 15, 8, 44); ring(m, 29, 31, 10); break;
    case "d": vbar(m, 37, 8, 44); ring(m, 23, 31, 10); break;
    case "p": vbar(m, 15, 20, 48); ring(m, 29, 30, 9); break;
    case "q": vbar(m, 37, 20, 48); ring(m, 23, 30, 9); break;
    case "o": ring(m, 26, 28, 13); break;
    case "c": ring(m, 26, 28, 13, 4, 0.7, Math.PI * 2 - 0.7); break;
    case "n": vbar(m, 14, 18, 44); vbar(m, 38, 26, 44); hbar(m, 22, 14, 38); break;
    case "u": vbar(m, 14, 16, 40); vbar(m, 38, 16, 40); hbar(m, 42, 14, 38); break;
    case "k": vbar(m, 14, 8, 44); line(m, 16, 28, 36, 10); line(m, 20, 30, 38, 46); break;
  }
  return m;
}

// Realistically messy kid drawing: heavy dropout, 2px wobble, a stray
// stroke, and slight scale/offset slop.
function jitter(src, rand) {
  const m = blank();
  const scale = 0.88 + rand() * 0.24;
  const ox = Math.round((rand() - 0.5) * 6), oy = Math.round((rand() - 0.5) * 6);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!src[y * SIZE + x]) continue;
    const r = rand();
    if (r < 0.28) continue; // dropped ink
    const j = r < 0.55 ? Math.round((rand() - 0.5) * 4) : 0;
    const k = r >= 0.55 && r < 0.7 ? Math.round((rand() - 0.5) * 4) : 0;
    setPx(m, (x - 26) * scale + 26 + ox + j, (y - 26) * scale + 26 + oy + k);
  }
  line(m, rand() * SIZE, rand() * SIZE, rand() * SIZE, rand() * SIZE, 3); // stray stroke
  for (let i = 0; i < 30; i++) setPx(m, rand() * SIZE, rand() * SIZE);
  return m;
}

// mulberry32 — deterministic runs.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = ["b", "d", "p", "q", "o", "c", "n", "u", "k"];
const templates = Object.fromEntries(LETTERS.map((ch) => [ch, letterShape(ch)]));

function stats(label, values) {
  const vs = [...values].sort((a, b) => a - b);
  const min = vs[0], max = vs[vs.length - 1];
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  console.log(`${label}: n=${vs.length} min=${min.toFixed(3)} mean=${mean.toFixed(3)} max=${max.toFixed(3)}`);
  return { min, max, mean };
}

// ACCEPT: genuine attempts (right or wrong letter), vs closest template.
const acceptScores = [];
for (const ch of LETTERS) {
  for (let i = 0; i < 14; i++) {
    const wobbly = jitter(templates[ch], rng(1000 + i));
    let best = Infinity;
    for (const t of LETTERS) best = Math.min(best, maskScore(wobbly, templates[t], SIZE));
    acceptScores.push(best);
  }
}

// REJECT: garbage vs closest template.
const negScores = [];
{
  const rand = rng(42);
  const garbageMasks = [];
  for (let i = 0; i < 12; i++) { const m = blank(); disk(m, 6 + rand() * 40, 6 + rand() * 40, 2 + rand() * 2.5); garbageMasks.push(m); }
  for (let i = 0; i < 12; i++) {
    const m = blank();
    if (rand() < 0.5) hbar(m, 6 + rand() * 40, 4, 48, 3 + rand() * 2); else vbar(m, 6 + rand() * 40, 4, 48, 3 + rand() * 2);
    garbageMasks.push(m);
  }
  for (let i = 0; i < 16; i++) {
    const m = blank();
    let x = 6 + rand() * 40, y = 6 + rand() * 40;
    for (let s = 0; s < 46; s++) {
      const nx = x + (rand() - 0.5) * 14, ny = y + (rand() - 0.5) * 14;
      line(m, x, y, nx, ny, 3); x = nx; y = ny;
    }
    garbageMasks.push(m);
  }
  for (const g of garbageMasks) {
    let best = Infinity;
    for (const ch of LETTERS) best = Math.min(best, maskScore(g, templates[ch], SIZE));
    negScores.push(best);
  }
}

console.log("--- maskScore distributions (lower = closer) ---");
const acc = stats("ACCEPT (messy genuine attempt vs closest template)", acceptScores);
const neg = stats("REJECT (garbage vs closest template)               ", negScores);

const gap = neg.min - acc.max;
console.log(`\ngap between worst genuine (${acc.max.toFixed(3)}) and best garbage (${neg.min.toFixed(3)}): ${gap.toFixed(3)}`);
const suggested = neg.min - Math.max(0.02, gap * 0.2);
console.log(`suggested MATCH_REJECT_SCORE: ${suggested.toFixed(3)} (just under best garbage)`);
const accRejected = acceptScores.filter((v) => v > suggested).length;
const negAccepted = negScores.filter((v) => v <= suggested).length;
console.log(`genuine attempts rejected: ${accRejected}/${acceptScores.length} | garbage accepted: ${negAccepted}/${negScores.length}`);
