// Silinx ink - a flip-flop drawn by hand (#1083), for the tests' circuits (synth-schematic.js): its box (one stroke,
// or a line a side), its pins' labels written inside (a wedge for the clock, Q with a bar for Q̄), in rows.
//
//   ffPins(g) -> { ins: { label: [x, y] }, outs: { Q | QN: [x, y] } } in gates' heights
//   drawFlipFlop(g, { rand, amount, px, size, seed }) -> strokes (pixels)
//     g: { type: 'ff', x, y, ins: ['D', 'C', ...] (from the top), outs: ['Q', 'QN'], wedge (the clock drawn as >) }
import { handDraw, writeText } from './synth.js';

export const FF_W = 1.3, FF_ROW = 0.45, FF_LABEL = 0.28;
const rows = g => Math.max(g.ins.length, g.outs.length);
export const ffHeight = g => 0.3 + FF_ROW * rows(g);
const rowY = (g, k) => g.y + 0.15 + FF_ROW * (k + 0.5);

export function ffPins(g) {
  return {
    ins: Object.fromEntries(g.ins.map((l, k) => [l, [g.x, rowY(g, k)]])),
    outs: Object.fromEntries(g.outs.map((l, k) => [l, [g.x + FF_W, rowY(g, k)]])),
  };
}

export function drawFlipFlop(g, { rand, amount, px, size, seed }) {
  const W = FF_W, H = ffHeight(g), strokes = [];
  const box = Math.floor(rand() * 2) === 0 ? [[[0, 0], [W, 0], [W, H], [0, H], [0, 0]]] : [[[0, 0], [W, 0]], [[W, 0], [W, H]], [[W, H], [0, H]], [[0, H], [0, 0]]];
  for (const s of handDraw(box, { rand, amount: amount * 0.6 })) strokes.push(s.map(p => px([g.x + p.x, g.y + p.y])));
  const h = FF_LABEL * size;
  const label = (text, k, side) => {
    const bar = text === 'QN';
    const w = writeText(bar ? 'Q' : text, { seed: seed * 17 + k * 5 + text.length + (side === 'right' ? 3 : 0), amount: amount * 0.7, size: h, x: 0, y: 0, bars: bar ? [[0, 0]] : [] });
    const xs = w.strokes.flat().map(p => p.x), width = Math.max(...xs) - Math.min(...xs);
    const c = px([side === 'left' ? g.x + 0.12 : g.x + W - 0.12, rowY(g, k)]);
    const dx = side === 'left' ? c.x - Math.min(...xs) : c.x - width - Math.min(...xs);
    strokes.push(...w.strokes.map(s => s.map(q => ({ x: q.x + dx, y: q.y + c.y - 0.55 * h }))));
  };
  g.ins.forEach((l, k) => {
    if (l === 'C' && g.wedge) {
      const y = rowY(g, k);
      strokes.push(...handDraw([[[0, -0.1], [0.17, 0], [0, 0.1]]], { rand, amount: amount * 0.5 }).map(s => s.map(p => px([g.x + p.x, y + p.y]))));
    } else label(l, k, 'left');
  });
  g.outs.forEach((l, k) => label(l, k, 'right'));
  return strokes;
}
