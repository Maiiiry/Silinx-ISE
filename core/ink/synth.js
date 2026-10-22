// Silinx ink - handwriting made from the skeleton font (#1056): a glyph drawn with a hand's irregularities (slant,
// rotation, proportions, strokes out of place, a wobbling pen), and a line of text written with it, overbars too.
// The built-in templates are made with it (scripts/ink-templates.mjs, mild), and so are the tests' held-out
// samples (other seeds, stronger).
//
//   rng(seed) -> () => [0, 1)
//   handGlyph(ch, { rand, amount, variant, slant }) -> strokes in cap-height units ([[{x, y}]]), or null
//   writeText(text, { seed, amount, size, x, y, bars: [[first, last]] }) -> { strokes, boxes, owner }
//     (strokes in pixels; boxes[i]: the box of text[i]; owner[k]: the character of stroke k, -1 for a bar;
//     bars: overbars over the characters first..last)
import { GLYPHS, advance } from './font.js';

/** A small seeded random generator (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// points every `step` along a polyline (a pen samples the stroke as it moves)
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
  }
  return out;
}

/** A glyph of the font as a hand writes it (amount 0: the skeleton itself). */
export function handGlyph(ch, { rand = rng(1), amount = 1, variant, slant: lean = 0 } = {}) {
  const vs = GLYPHS[ch];
  if (!vs) return null;
  const v = vs[variant ?? Math.floor(rand() * vs.length) % vs.length];
  const r = (k) => (rand() * 2 - 1) * k * amount;
  const slant = lean + r(0.1), rot = r(0.08), sx = 1 + r(0.15), sy = 1 + r(0.1);
  const xs = v.flat().map(p => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = 0.5;
  const strokes = v.map(stroke => {
    const dx = r(0.03), dy = r(0.03);
    let wob = { x: 0, y: 0 };
    return densify(stroke.map(([x, y]) => ({ x, y })), 0.04).map(p => {
      // a slowly wandering pen
      wob = { x: wob.x * 0.8 + r(0.012), y: wob.y * 0.8 + r(0.012) };
      let x = (p.x - cx) * sx, y = (p.y - cy) * sy;
      x += slant * (cy - y) / 1;
      [x, y] = [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
      return { x: x + cx + dx + wob.x, y: y + cy + dy + wob.y };
    });
  });
  return strokes;
}

/** A line of text written by hand: its strokes (pixels) and the box of each character. */
export function writeText(text, { seed = 1, amount = 1, size = 60, x = 20, y = 20, bars = [], spacing = 1 } = {}) {
  const rand = rng(seed);
  const lean = (rand() * 2 - 1) * 0.25 * amount;   // the writer's slant
  const strokes = [], boxes = [], owner = [];
  let pen = x;
  for (const ch of text) {
    if (ch === ' ') { pen += 0.35 * size * spacing; boxes.push(null); continue; }
    const g = handGlyph(ch, { rand, amount, slant: lean });
    if (!g) throw new Error(`no glyph for '${ch}'`);
    const ps = g.map(s => s.map(p => ({ x: pen + p.x * size, y: y + p.y * size + (rand() * 2 - 1) * 0.03 * size * amount })));
    strokes.push(...ps);
    owner.push(...ps.map(() => boxes.length));
    const all = ps.flat();
    boxes.push({ minX: Math.min(...all.map(p => p.x)), maxX: Math.max(...all.map(p => p.x)), minY: Math.min(...all.map(p => p.y)), maxY: Math.max(...all.map(p => p.y)) });
    pen += advance(ch) * size * spacing * (1 + (rand() * 2 - 1) * 0.12 * amount);
  }
  // overbars, the shortest first: each one above what is under it (an inner bar too)
  const chars = [...text];
  const tops = boxes.map(b => b?.minY);
  for (const [i, j] of [...bars].sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]))) {
    const under = boxes.slice(i, j + 1).filter(Boolean);
    if (!under.length || chars.length <= j) throw new Error(`bad bar [${i}, ${j}]`);
    const top = Math.min(...tops.slice(i, j + 1).filter(t => t != null));
    const by = top - 0.16 * size, x0 = Math.min(...under.map(b => b.minX)) - 0.04 * size, x1 = Math.max(...under.map(b => b.maxX)) + 0.04 * size;
    const tilt = (rand() * 2 - 1) * 0.03 * size * amount;
    strokes.push(densify([{ x: x0, y: by - tilt }, { x: x1, y: by + tilt }], 0.04 * size));
    owner.push(-1);
    for (let k = i; k <= j; k++) if (tops[k] != null) tops[k] = by - Math.abs(tilt);
  }
  return { strokes, boxes, owner };
}
