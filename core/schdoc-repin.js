// A symbol's pins moved or changed (connections are geometric): the wires, I/O markers and net names on a pin that
// stays following it (Update Symbol's way, #1183, out of core/schdoc-modsym.js), and a symbol whose parameters change
// its pins (#1555: a COMP's comparisons, an output each) re-pinned that way, the wires of a pin that goes dropped.
// Isomorphic (no DOM).
import { symbolDef, xform } from './schdoc-symbols.js';

const same = (a, b) => a.x === b.x && a.y === b.y;
const at = q => `${q.x},${q.y}`;

/** The pins of the symbols other than s, where they are ('x,y'). */
export function otherPins(doc, s, modules = {}) {
  return new Set(doc.symbols.filter(o => o !== s).flatMap(o => { const d = symbolDef(o, modules); return d.pins.map(p => at(xform(o, d, p.x, p.y))); }));
}

/** The pins that stay and move, carried out on doc (in place): moves maps where a pin was ('x,y') to { from, to, p }.
 *  Each wire end, I/O marker and net name there moved once, a corner added where the run would go slanted; a pin moved
 *  off another symbol's pin it touched (others: otherPins) gets a wire from there to it. */
export function followPins(doc, moves, others) {
  for (const w of doc.wires) {
    const ends = [0, w.points.length - 1].map(e => ({ e, mv: moves.get(at(w.points[e])) }));
    for (const { e, mv } of ends.reverse()) {   // (the last end first: the first one's index stays)
      if (!mv) continue;
      const { from, to } = mv, pt = w.points[e], next = w.points[e === 0 ? 1 : e - 1];
      // the end moved to the pin; a corner where the run would go slanted
      const corner = from.x === to.x ? (next.x === pt.x ? null : { x: next.x, y: to.y }) : (next.y === pt.y ? null : { x: to.x, y: next.y });
      const run = corner && !same(corner, to) && !same(corner, next) ? [corner, { ...to }] : [{ ...to }];
      if (e === 0) w.points.splice(0, 1, ...run.reverse()); else w.points.splice(e, 1, ...run);
    }
    w.points = w.points.filter((q, i) => i === 0 || !same(q, w.points[i - 1]));
  }
  doc.wires = doc.wires.filter(w => w.points.length >= 2);
  for (const o of [...doc.ports, ...doc.labels]) { const mv = moves.get(at(o)); if (mv) { o.x = mv.to.x; o.y = mv.to.y; } }
  for (const { from, to, p } of moves.values()) {
    if (!others.has(at(from))) continue;
    const w = { id: `W${doc.wires.length + 1}`, points: [{ ...from }, { ...to }] };
    while (doc.wires.some(x => x.id === w.id)) w.id += '_';
    if ((p.width || 1) > 1) w.bus = true;
    doc.wires.push(w);
  }
}

/** The symbol s (in doc) changed by change(s), its parameters making other pins (#1555): a pin that stays (by name, or
 *  the name rename gives its old one: { O: 'EQ' }) keeps its wires, I/O markers and net names, following it; the wires
 *  with an end on a pin that goes are dropped. doc changed in place. Returns { removed: [old pin names] }. */
export function repinSymbol(doc, s, change, { modules = {}, rename = {} } = {}) {
  const oldDef = symbolDef(s, modules), oldAt = new Map(oldDef.pins.map(p => [p.name, xform(s, oldDef, p.x, p.y)]));
  const others = otherPins(doc, s, modules);
  change(s);
  const newDef = symbolDef(s, modules);
  const target = n => rename[n] ?? n;
  const kept = new Set(newDef.pins.map(p => p.name));
  const removed = oldDef.pins.map(p => p.name).filter(n => !kept.has(target(n)));
  const gone = new Set(removed.map(n => at(oldAt.get(n))));
  doc.wires = doc.wires.filter(w => !gone.has(at(w.points[0])) && !gone.has(at(w.points[w.points.length - 1])));
  const moves = new Map();
  for (const q of oldDef.pins) {
    const p = newDef.pins.find(x => x.name === target(q.name));
    if (!p) continue;
    const from = oldAt.get(q.name), to = xform(s, newDef, p.x, p.y);
    if (!same(from, to)) moves.set(at(from), { from, to, p });
  }
  followPins(doc, moves, others);
  return { removed };
}
