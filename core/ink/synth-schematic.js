// Silinx ink - a circuit drawn by hand (#1067), made with the hand of synth.js: the gates' outlines (gates.js, a bubble
// for an inversion), the flip-flops' boxes (synth-flipflop.js, #1083), the wires square with a wobbling pen (a T
// junction for a net to more than one gate, a way round under the drawing back to the left), the inputs' and outputs'
// names at the wires' free ends. The tests' held-out circuits are made with it.
//
//   writeSchematic(spec, { seed, amount, size, x, y }) -> { strokes }
//     spec: { gates: [{ type: and|or|xor|nand|nor|xnor|not|buf, x, y, n } | a flip-flop, synth-flipflop.js],
//             nets: [{ name, at: [x, y], to: [[gate, pin], ...], j }  an input: its name left of `at`; j: where on the
//                    first wire the others start (a fraction of its first part)
//                    { from: gate, out, to: [[gate, pin], ...], name, via }] } a gate's output (no `to`: an output, its
//                    wire drawn); out: a flip-flop's Q or QN; pin: a flip-flop's label; via: the height of a way round
//                    (back to the left, under the drawing)
//     the positions in gates' heights (size pixels), a gate's top left corner at (x, y)
import { GATES, TIP, BUBBLE, bubble } from './gates.js';
import { handDraw, writeText, rng } from './synth.js';
import { ffPins, drawFlipFlop } from './synth-flipflop.js';

const BASE = { and: 'and', nand: 'and', or: 'or', nor: 'or', xor: 'xor', xnor: 'xor', buf: 'buf', not: 'buf' };
const inverted = type => ['nand', 'nor', 'xnor', 'not'].includes(type);

/** Where a gate's input pin k (of n) and its output are, in gates' heights. */
export function gatePins(g) {
  const back = t => (BASE[g.type] === 'or' ? 0.15 * Math.sin(Math.PI * t) : BASE[g.type] === 'xor' ? -0.18 + 0.15 * Math.sin(Math.PI * t) : 0);
  const n = g.n ?? (BASE[g.type] === 'buf' ? 1 : 2);
  return {
    ins: Array.from({ length: n }, (_, k) => { const t = (k + 1) / (n + 1); return [g.x + back(t), g.y + t]; }),
    out: [g.x + TIP + (inverted(g.type) ? 2 * BUBBLE : 0), g.y + 0.5],
  };
}

export function writeSchematic(spec, { seed = 1, amount = 1, size = 70, x = 40, y = 30 } = {}) {
  const rand = rng(seed * 104729 + 7);
  const px = ([u, v]) => ({ x: x + u * size, y: y + v * size });
  const strokes = [];
  // a square path drawn by hand: each corner a little off, the pen wobbling
  const wire = (pts) => {
    const out = [];
    let w = 0;
    pts.forEach((p, i) => {
      if (!i) { out.push(p); return; }
      const a = pts[i - 1], n = Math.max(2, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / (0.08 * size)));
      for (let k = 1; k <= n; k++) {
        w = w * 0.8 + (rand() * 2 - 1) * 0.015 * size * amount;
        const t = k / n;
        out.push({ x: a.x + (p.x - a.x) * t + (a.y === p.y ? 0 : w), y: a.y + (p.y - a.y) * t + (a.x === p.x ? 0 : w) });
      }
    });
    strokes.push(out);
  };
  const square = (P, Q, mx) => (Math.abs(P.y - Q.y) < 1 ? [P, Q] : [P, { x: mx, y: P.y }, { x: mx, y: Q.y }, Q]);
  // the gates
  for (const g of spec.gates) {
    if (g.type === 'ff') { strokes.push(...drawFlipFlop(g, { rand, amount, px, size, seed })); continue; }
    const vs = GATES[BASE[g.type]];
    const v = vs[Math.floor(rand() * vs.length) % vs.length];
    for (const s of handDraw(v, { rand, amount })) strokes.push(s.map(p => px([g.x + p.x, g.y + p.y])));
    if (inverted(g.type)) strokes.push(bubble().map(([u, v2]) => px([g.x + u, g.y + v2])));
  }
  const name = (text, at, side) => {
    const h = 0.45 * size, w = writeText(text, { seed: seed * 31 + text.length, amount, size: h, x: 0, y: 0 });
    const xs = w.strokes.flat().map(p => p.x), width = Math.max(...xs) - Math.min(...xs);
    const p = px(at), dx = side === 'left' ? p.x - 0.12 * size - width - Math.min(...xs) : p.x + 0.12 * size - Math.min(...xs);
    strokes.push(...w.strokes.map(s => s.map(q => ({ x: q.x + dx, y: q.y + p.y - 0.55 * h }))));
  };
  // the nets: from their source to each pin, the second and later ones from a T on the first wire
  for (const net of spec.nets) {
    const pinsOf = g => (g.type === 'ff' ? ffPins(g) : gatePins(g));
    const src = net.from != null ? (spec.gates[net.from].type === 'ff' ? ffPins(spec.gates[net.from]).outs[net.out ?? 'Q'] : gatePins(spec.gates[net.from]).out) : net.at;
    const S = px(src);
    const sinks = (net.to || []).map(([gi, k]) => px(pinsOf(spec.gates[gi]).ins[k]));
    if (net.name && net.from == null) name(net.name, src, 'left');
    if (!sinks.length) {
      if (net.from == null) continue;
      wire([S, px([src[0] + 1.2, src[1]])]);
      if (net.name) name(net.name, [src[0] + 1.2, src[1]], 'right');
      continue;
    }
    const vy = net.via != null ? px([0, net.via]).y : null, out = S.x + 0.3 * size;
    sinks.forEach((Q, i) => {
      const mx = Q.x - 0.35 * size;
      // (back to the left: round under the drawing)
      if (vy != null) { wire(i === 0 ? [S, { x: out, y: S.y }, { x: out, y: vy }, { x: mx, y: vy }, { x: mx, y: Q.y }, Q] : [{ x: mx, y: vy }, { x: mx, y: Q.y }, Q]); return; }
      if (i === 0) { wire(square(S, Q, mx)); return; }
      const first = sinks[0], fx = first.x - 0.35 * size;
      const J = { x: S.x + (net.j ?? 0.5) * (Math.min(fx, mx) - S.x), y: S.y };
      wire([J, { x: J.x, y: Q.y }, Q]);
    });
    // an output that is also an input of the drawing: its name at the end of a wire up from a T near its source
    if (net.name && net.from != null) {
      const J = { x: S.x + 0.12 * size, y: S.y }, E = { x: J.x + 0.8 * size, y: S.y - 0.6 * size };
      wire([J, { x: J.x, y: E.y }, E]);
      name(net.name, [(E.x - x) / size, (E.y - y) / size], 'right');
    }
  }
  return { strokes };
}
