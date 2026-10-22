// Silinx ink - a truth table written by hand (#1066), made with the hand of synth.js: the header's names, the cells,
// a line under the header and one between the inputs and the outputs (a double one in a full grid). The tests'
// held-out tables are made with it.
//
//   writeTable(rows, { split, seed, amount, size, x, y, grid, lines }) -> { strokes }
//     rows: [[name, ...], [cell, ...], ...] (the header first); split: the number of inputs (default: all but the
//     last column); grid: a line between every row and every column too; lines: false, no line at all
import { writeText, rng } from './synth.js';
import { advance } from './font.js';

// a ruled line drawn by hand: a little tilted, wobbling
function rule(a, b, rand, amount, size) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (0.1 * size)));
  const tilt = (rand() * 2 - 1) * 0.06 * size * amount;
  let w = 0;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    w = w * 0.8 + (rand() * 2 - 1) * 0.02 * size * amount;
    const vertical = a.x === b.x;
    return { x: a.x + (b.x - a.x) * t + (vertical ? tilt * t + w : 0), y: a.y + (b.y - a.y) * t + (vertical ? 0 : tilt * t + w) };
  });
}

const textWidth = (s, size) => [...s].reduce((w, ch) => w + advance(ch), 0) * size - 0.25 * size;

export function writeTable(rows, { split, seed = 1, amount = 1, size = 50, x = 30, y = 20, grid = false, lines = true } = {}) {
  const rand = rng(seed * 7919 + 13);
  const cols = rows[0].length;
  const nIn = split ?? cols - 1;
  const colW = Array.from({ length: cols }, (_, c) => Math.max(...rows.map(r => textWidth(String(r[c]), size))) + 0.9 * size);
  const colX = colW.map((_, c) => x + colW.slice(0, c).reduce((s, w) => s + w, 0) + (c >= nIn ? 0.4 * size : 0));
  const rowH = 1.7 * size, right = colX[cols - 1] + colW[cols - 1], bottom = y + rows.length * rowH;
  const strokes = [];
  rows.forEach((r, i) => r.forEach((cell, c) => {
    const s = String(cell);
    const jx = (rand() * 2 - 1) * 0.12 * size * amount, jy = (rand() * 2 - 1) * 0.1 * size * amount;
    const w = writeText(s, { seed: seed * 1000 + i * 37 + c, amount, size, x: colX[c] + (colW[c] - textWidth(s, size)) / 2 + jx, y: y + i * rowH + 0.3 * size + jy });
    strokes.push(...w.strokes);
  }));
  if (!lines) return { strokes };
  const line = (a, b) => strokes.push(rule(a, b, rand, amount, size));
  const top = y - 0.1 * size, left = x - 0.3 * size;
  // under the header, and between the inputs and the outputs (double in a grid)
  line({ x: left, y: y + rowH }, { x: right, y: y + rowH });
  const sx = (colX[nIn - 1] + colW[nIn - 1] + colX[nIn]) / 2;
  line({ x: sx, y: top }, { x: sx, y: bottom });
  if (grid) {
    line({ x: sx + 0.18 * size, y: top }, { x: sx + 0.18 * size, y: bottom });
    for (let i = 2; i < rows.length; i++) line({ x: left, y: y + i * rowH }, { x: right, y: y + i * rowH });
    for (let c = 1; c < cols; c++) if (c !== nIn) line({ x: colX[c], y: top }, { x: colX[c], y: bottom });
  }
  return { strokes };
}
