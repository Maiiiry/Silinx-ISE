// Silinx ink - the gates of a schematic drawn by hand (#1067): their outlines as the strokes a pen draws, in
// variants (one stroke or several), the inputs on the left and the output on the right. Units: the gate's height is 1,
// its back at x = 0; the output's tip at x = TIP (the bubble of an inversion after it, of radius BUBBLE). The
// recognizer's templates are made from them (gateTemplates), the tests' circuits too (core/ink/synth-schematic.js).
//
//   GATES: { and | or | xor | buf: [variant, ...] }; gateTemplates() -> $P templates of the bodies
import { template } from './pdollar.js';
import { handDraw, rng } from './synth.js';

export const TIP = 1.1, BUBBLE = 0.1;
const N = 16;
const curve = (f) => Array.from({ length: N + 1 }, (_, i) => f(i / N));
const arc = (cx, cy, rx, ry, a0, a1) => curve(t => { const a = (a0 + (a1 - a0) * t) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
// an OR's three curves: its hollow back (top to bottom), its bottom and its top side to the tip
const orBack = (dx = 0) => curve(t => [dx + 0.15 * Math.sin(Math.PI * t), t]);
const orBottom = curve(t => [TIP * t, 1 - 0.5 * t * t]);
const orTop = curve(t => [TIP * (1 - t), 0.5 * (1 - t) * (1 - t)]);
const andBody = [[0.45, 0], [0, 0], [0, 1], [0.45, 1], ...arc(0.45, 0.5, TIP - 0.45, 0.5, 90, -90).slice(1)];

export const GATES = {
  and: [[andBody], [[[0, 0], [0, 1]], [[0, 0], [0.45, 0], ...arc(0.45, 0.5, TIP - 0.45, 0.5, -90, 90), [0, 1]]]],
  or: [[[...orBack(), ...orBottom.slice(1), ...orTop.slice(1)]], [orBack(), orBottom, orTop.slice().reverse()]],
  xor: [[orBack(-0.18), [...orBack(), ...orBottom.slice(1), ...orTop.slice(1)]], [orBack(-0.18), orBack(), orBottom, orTop]],
  buf: [[[[0, 0], [TIP, 0.5], [0, 1], [0, 0]]], [[[0, 0], [0, 1]], [[0, 0], [TIP, 0.5]], [[0, 1], [TIP, 0.5]]]],
};

/** The bubble of an inversion at the tip of a gate (its own units). */
export const bubble = () => arc(TIP + BUBBLE, 0.5, BUBBLE, BUBBLE, 180, 540);

let templates = null;
/** $P templates of the gates' bodies: each variant as drawn and twice by a hand (fixed seeds). */
export function gateTemplates() {
  if (templates) return templates;
  const rand = rng(11);
  templates = [];
  for (const [kind, vs] of Object.entries(GATES)) {
    for (const v of vs) for (const amount of [0, 0.5, 0.5]) templates.push(template(kind, handDraw(v, { rand, amount })));
  }
  return templates;
}
