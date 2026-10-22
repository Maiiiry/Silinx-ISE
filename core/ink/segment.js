// Silinx ink - one line of handwriting split into characters by its layout (#1056): the overbars first (a flat
// stroke with ink under it, a gap between), then the other strokes grouped by their horizontal overlap, a small mark
// at the top right of a character (a prime) apart from it, the dot of an i or a j with it, strokes that meet together.
//
// The writing is made upright first (its slant: slantOf).
//
//   segment(strokes) -> { chars: [{ strokes, box, ink }], bars: [{ stroke, box, ink }], H, slant }
//     strokes: [[{x, y}, ...], ...] (any unit, y downwards); chars from left to right, upright; ink: the indexes
//     of their strokes in the ink not empty; H: the height of a line
//   boxOf(strokes) -> { minX, minY, maxX, maxY, w, h, cx, cy }

export class InkError extends Error {}

export function boxOf(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

const flat = b => b.h <= 0.2 * b.w;

// the height of the line: most strokes' height (a capital's, else a lower-case letter's)
function lineHeight(items) {
  const hs = items.filter(i => !flat(i.box)).map(i => i.box.h).sort((a, b) => a - b);
  if (!hs.length) return Math.max(...items.map(i => i.box.w)) || 1;
  return hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.75))] || 1;
}

// a flat stroke over ink (with a gap), not only over lines (the other line of an =): a bar of NOT
function findBars(items, H) {
  const bars = [];
  for (const b of items) {
    if (!flat(b.box) || b.box.w < 0.25 * H) continue;
    const under = items.filter(s => s !== b && s.box.cx >= b.box.minX - 0.05 * H && s.box.cx <= b.box.maxX + 0.05 * H && s.box.minY >= b.box.maxY + 0.1 * H);
    if (under.some(s => !flat(s.box) && s.box.h >= 0.25 * H)) bars.push(b);
  }
  return bars;
}

// a small steep mark in the upper half of a character, right of its middle: a prime, not a part of it (unless it
// is above the top end of the character's stroke: the dot of an i or a j)
function isPrime(s, c, H) {
  const top = c.items.flatMap(i => i.stroke).reduce((a, p) => (p.y < a.y ? p : a));
  if (s.box.maxY < top.y && Math.abs(s.box.cx - top.x) < 0.12 * H) return false;
  return s.box.h >= 0.8 * s.box.w && Math.hypot(s.box.w, s.box.h) < 0.45 * Math.max(c.box.h, 0.3 * H) && s.box.maxY < c.box.minY + 0.5 * c.box.h &&
    s.box.cx > c.box.cx + 0.25 * c.box.w + 0.08 * H;
}

// a stroke whose end meets a character's strokes, or the reverse (the arms of a Y side by side)
function touches(s, c, gap) {
  if (s.box.minX > c.box.maxX + gap) return false;
  const near = (p, pts) => pts.some(q => Math.abs(p.x - q.x) <= gap && Math.abs(p.y - q.y) <= gap);
  const cs = c.items.map(i => i.stroke);
  return [s.stroke[0], s.stroke.at(-1)].some(p => cs.some(st => near(p, st))) || cs.some(st => [st[0], st.at(-1)].some(p => near(p, s.stroke)));
}

/**
 * The slant of the writing: dx/dy of its steep parts (a hand leaning right: > 0). Upright again, x - slant·y, the
 * characters side by side no longer overlap in x, and they look like the templates.
 */
export function slantOf(strokes) {
  let sx = 0, sy = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) {
      const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y;
      if (Math.abs(dy) < 2 * Math.abs(dx) || dy === 0) continue;
      sx += dy > 0 ? dx : -dx; sy += Math.abs(dy);
    }
  }
  return sy ? Math.max(-0.6, Math.min(0.6, sx / sy)) : 0;
}

export function segment(strokes) {
  const live = (strokes || []).filter(s => Array.isArray(s) && s.length);
  if (!live.length) throw new InkError('Nothing written: write the expression on the pad.');
  const slant = slantOf(live);
  const items = live.map(s => s.map(p => ({ x: p.x + slant * (-p.y), y: p.y }))).map((s, k) => ({ stroke: s, box: boxOf([s]), k }));
  const H = lineHeight(items);
  const bars = findBars(items, H);
  const rest = items.filter(i => !bars.includes(i)).sort((a, b) => a.box.minX - b.box.minX);
  const groups = [];
  for (const s of rest) {
    const c = groups.at(-1);
    if (c) {
      const ov = Math.min(c.box.maxX, s.box.maxX) - Math.max(c.box.minX, s.box.minX);
      if ((ov >= 0.3 * Math.min(c.box.w, s.box.w) - 0.06 * H || touches(s, c, 0.05 * H)) && !isPrime(s, c, H)) {
        c.items.push(s);
        c.box = boxOf(c.items.map(i => i.stroke));
        continue;
      }
    }
    groups.push({ items: [s], box: s.box });
  }
  return {
    chars: groups.map(g => ({ strokes: g.items.map(i => i.stroke), box: g.box, ink: g.items.map(i => i.k) })),
    bars: bars.map(b => ({ stroke: b.stroke, box: b.box, ink: [b.k] })),
    H, slant,
  };
}
