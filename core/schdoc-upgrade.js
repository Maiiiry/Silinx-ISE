// A schematic of an earlier document version brought to the current one (core/schdoc.js normalizeDoc), where a
// symbol's geometry changed and its connections, geometric, have to follow it.
//
// 4 (#1136): the multiplexers 70 px wide, as the DEMUX (they were 40 px for M2_1 / M4_1, 60 for M8_1; M16_1 kept at 80).
// Each is placed so that its data inputs, its enable and its select bits stay where they were; only its output O moves,
// along its lead, and what was connected there goes with it: a wire's end (its last run lengthened or shortened, or a
// run added when that run is across), an I/O marker, a net name; another symbol's pin there gets a wire to the new O.
// Isomorphic (no DOM).
import { MUX_BODY_W, MUX_INPUTS, MUX_OLD_BODY_W, symbolDef, xform } from './schdoc-symbols.js';

const same = (a, b) => a.x === b.x && a.y === b.y;

/** The multiplexers of doc (version 3) widened (#1136), doc changed in place (modules: the project's, normalized). */
export function widenMuxes(doc, modules = {}) {
  const muxes = doc.symbols.filter(s => MUX_INPUTS[s.type]);
  // (the pins of the other symbols, where a multiplexer's output met them directly)
  const others = new Set(muxes.length ? doc.symbols.filter(s => !MUX_INPUTS[s.type]).flatMap(s => {
    const def = symbolDef(s, modules);
    return def.pins.map(p => { const q = xform(s, def, p.x, p.y); return `${q.x},${q.y}`; });
  }) : []);
  for (const s of muxes) {
    const def = symbolDef(s, {}), k = Math.log2(MUX_INPUTS[s.type]), oldW = MUX_OLD_BODY_W(k);
    if (oldW === MUX_BODY_W(k)) continue;
    // the drawing of before: the same, its body narrower and its output nearer (its box narrower)
    const old = { ...def, w: oldW + 40 };
    const o = def.pins.find(p => p.name === 'O');
    // placed so that D0 stays where it was: every pin of the same local place stays (the same turn and mirror)
    const d0 = def.pins[0], a = xform(s, old, d0.x, d0.y), b = xform(s, def, d0.x, d0.y);
    const before = xform(s, old, oldW + 40, o.y);
    s.x += a.x - b.x; s.y += a.y - b.y;
    const after = xform(s, def, o.x, o.y);
    if (same(before, after)) continue;
    const across = before.x === after.x ? 'x' : 'y';   // (the axis the output moved along: x or y stays)
    let joined = false;
    for (const w of doc.wires) {
      for (const last of [false, true]) {
        if (w.points.length < 2) break;
        const end = last ? w.points.length - 1 : 0, p = w.points[end];
        if (!same(p, before)) continue;
        const next = w.points[end === 0 ? 1 : end - 1];
        if (next[across] === p[across]) {
          // its last run along the lead: its end moved (a run of no length left: the point dropped)
          w.points[end] = { ...after };
          if (same(w.points[end], next)) w.points.splice(end, 1);
        } else joined = true;
      }
    }
    doc.wires = doc.wires.filter(w => w.points.length >= 2);
    for (const m of [...doc.ports, ...doc.labels]) if (same(m, before)) { m.x = after.x; m.y = after.y; }
    // a run across, or another symbol's pin there: a wire from there to the new output
    if (joined || others.has(`${before.x},${before.y}`)) {
      const w = { id: `W${doc.wires.length + 1}`, points: [{ ...before }, { ...after }] };
      while (doc.wires.some(x => x.id === w.id)) w.id += '_';
      if ((o.width || 1) > 1) w.bus = true;
      doc.wires.push(w);
    }
  }
  return doc;
}
