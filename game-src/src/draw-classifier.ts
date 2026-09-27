// Drawing classifier for the letter game, plus the match-quality gate.
//
// classifyDrawing() always returns the *closest* template, so a dot or a
// scribble still "matches" something. The check handler must ALSO consult
// isConfidentMatch(score): when the best score is worse than
// MATCH_REJECT_SCORE the drawing is too far from every template and the kid
// is asked to try again (no coins change) instead of being graded.
//
// MATCH_REJECT_SCORE was calibrated with scripts/calibrate.mjs: synthetic
// wobbly-but-letterlike drawings (must accept) vs dots, straight lines and
// random scribbles (must reject). Re-run that script and adjust if drawings
// on real devices disagree.

export type Letter = "b" | "d" | "p" | "q" | "n" | "u" | "c" | "k";

export const LETTERS: Letter[] = ["b", "d", "p", "q", "n", "u", "c", "k"];

// Calibrated with `bun scripts/calibrate.mjs` (same maskScore metric):
//   ACCEPT (126 messy genuine attempts vs closest template): max 0.177, mean 0.092
//   REJECT (40 dots / lines / scribbles vs closest template): min 0.141, mean 0.226
// Threshold sits just under the best-scoring garbage: no garbage accepted in
// calibration, ~13% of the deliberately-extreme messy attempts rejected.
// A false reject only costs a redraw (no coins lost); a false accept lets a
// scribble earn coins. Re-run the script if real drawings disagree.
export const MATCH_REJECT_SCORE = 0.12;

export function isConfidentMatch(score: number): boolean {
  return score <= MATCH_REJECT_SCORE;
}

const TEMPLATE_FONTS = ['"Avenir Next"', '"Trebuchet MS"', '"Comic Sans MS"', 'sans-serif'];

function alphaMask(canvas: HTMLCanvasElement, size = 52): Uint8Array | null {
  const source = canvas.getContext("2d", { willReadFrequently: true });
  if (!source) return null;
  const data = source.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const alpha = data[(y * canvas.width + x) * 4 + 3] ?? 0;
      if (alpha > 24) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const pad = 5;
  const scale = Math.min((size - pad * 2) / width, (size - pad * 2) / height);
  const out = document.createElement("canvas");
  out.width = size; out.height = size;
  const outCtx = out.getContext("2d", { willReadFrequently: true });
  if (!outCtx) return null;
  outCtx.drawImage(canvas, minX, minY, width, height, (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
  const pixels = outCtx.getImageData(0, 0, size, size).data;
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i += 1) mask[i] = (pixels[i * 4 + 3] ?? 0) > 35 ? 1 : 0;
  return mask;
}

function templateMask(letter: Letter, font: string, size = 52): Uint8Array | null {
  const canvas = document.createElement("canvas");
  canvas.width = 240; canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#14213d";
  ctx.font = `700 190px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, 120, 116);
  return alphaMask(canvas, size);
}

export function points(mask: Uint8Array, size: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) result.push([i % size, Math.floor(i / size)]);
  }
  return result;
}

export function directedDistance(from: Array<[number, number]>, to: Array<[number, number]>, size: number): number {
  if (from.length === 0 || to.length === 0) return 1;
  let total = 0;
  const stride = Math.max(1, Math.floor(from.length / 420));
  let samples = 0;
  for (let i = 0; i < from.length; i += stride) {
    const source = from[i];
    if (!source) continue;
    let best = Number.POSITIVE_INFINITY;
    for (const target of to) {
      const dx = source[0] - target[0];
      const dy = source[1] - target[1];
      const distance = dx * dx + dy * dy;
      if (distance < best) best = distance;
      if (best === 0) break;
    }
    total += Math.sqrt(best) / size;
    samples += 1;
  }
  return samples > 0 ? total / samples : 1;
}

export function gridFeatures(mask: Uint8Array, size: number): number[] {
  const cells = 4;
  const values: number[] = [];
  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      let ink = 0;
      let count = 0;
      const x0 = Math.floor(gx * size / cells);
      const x1 = Math.floor((gx + 1) * size / cells);
      const y0 = Math.floor(gy * size / cells);
      const y1 = Math.floor((gy + 1) * size / cells);
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        ink += mask[y * size + x] ?? 0;
        count += 1;
      }
      values.push(count ? ink / count : 0);
    }
  }
  return values;
}

export function maskScore(a: Uint8Array, b: Uint8Array, size: number): number {
  const aPoints = points(a, size);
  const bPoints = points(b, size);
  const shape = directedDistance(aPoints, bPoints, size) * 0.6 + directedDistance(bPoints, aPoints, size) * 0.4;
  const af = gridFeatures(a, size);
  const bf = gridFeatures(b, size);
  let feature = 0;
  for (let i = 0; i < af.length; i += 1) feature += Math.abs((af[i] ?? 0) - (bf[i] ?? 0));
  return shape + (feature / af.length) * 0.72;
}

export function classifyDrawing(canvas: HTMLCanvasElement): { letter: Letter; score: number } | null {
  const size = 52;
  const user = alphaMask(canvas, size);
  if (!user) return null;
  let best: { letter: Letter; score: number } | null = null;
  for (const letter of LETTERS) {
    for (const font of TEMPLATE_FONTS) {
      const template = templateMask(letter, font, size);
      if (!template) continue;
      const score = maskScore(user, template, size);
      if (!best || score < best.score) best = { letter, score };
    }
  }
  return best;
}
