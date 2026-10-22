// Silinx ink - the schematic of a circuit drawn by hand (#1067): readSchematic's gates as Silinx's symbols where they
// were drawn (a gate's height in the drawing, Hg, is 40 on the sheet, its width 80), an I/O marker at each name's wire end, and
// each net's wires routed square by the wire router (core/schpath.js routePath, as a freehand wire stroke is, #1052):
// from its source (a gate's output, an input marker) to each of its pins, a pin after the first one to the net's
// nearest wire point when the way from the source is not clear.
//
//   schematicFromCircuit(circuit, { name, lang }) -> { doc, warnings }
import { GRID, newDoc, symbolDef, symbolBox, symbolPins, portBox, joinOnWires } from '../schdoc.js';
import { wireGrid, routePath, segPoints, cleanPath } from '../schpath.js';
import { TIP } from './gates.js';

const snap = v => Math.round(v / GRID) * GRID;

export function schematicFromCircuit(circuit, { name = 'schematic', lang = 'vhdl' } = {}) {
  const doc = newDoc(name, lang);
  // (a drawn gate's height is 40 on the sheet, its width TIP·Hg the 80 of a symbol)
  const Sy = 40 / circuit.Hg, Sx = 80 / (TIP * circuit.Hg), warnings = [];
  const pt = p => ({ x: snap(p.x * Sx), y: snap(p.y * Sy) });
  // the gates, where they were drawn
  const pins = new Map();
  circuit.gates.forEach((g, i) => {
    const s = { id: `S${i + 1}`, type: g.type, x: 0, y: 0, rot: 0, mirror: false, name: g.id, params: { width: 1 } };
    const h = symbolBox(s, {}, symbolDef(s)).h;
    Object.assign(s, { x: snap(g.box.minX * Sx), y: snap(g.box.cy * Sy - h / 2) });
    doc.symbols.push(s);
  });
  // the markers, at the names' wire ends
  let pid = 0;
  for (const n of circuit.nets) if (n.dir) doc.ports.push({ id: `P${++pid}`, name: n.name, dir: n.dir, width: 1, ...pt(n.at) });
  // the drawing moved to the sheet's top left corner (a margin of 40)
  const boxes = [...doc.symbols.map(s => symbolBox(s, {}, symbolDef(s))), ...doc.ports.map(portBox)];
  const dx = 40 - snap(Math.min(...boxes.map(b => b.x))), dy = 40 - snap(Math.min(...boxes.map(b => b.y)));
  for (const o of [...doc.symbols, ...doc.ports]) { o.x += dx; o.y += dy; }
  doc.symbols.forEach((s, i) => {
    const ps = symbolPins(s, {}, symbolDef(s));
    pins.set(circuit.gates[i].id, { out: ps.find(p => p.dir === 'out'), ins: ps.filter(p => p.dir === 'in').sort((a, b) => a.y - b.y) });
  });
  // a marker clear of its pins: an input's left of them, an output's right of its gate's
  const portOf = n => doc.ports.find(p => p.name === n.name);
  for (const n of circuit.nets) {
    const p = portOf(n);
    if (!p) continue;
    if (n.dir === 'in' && n.sinks.length) p.x = Math.min(p.x, Math.min(...n.sinks.map(k => pins.get(k.gate).ins[k.pin].x)) - 30);
    if (n.dir === 'out' && n.driver) p.x = Math.max(p.x, pins.get(n.driver).out.x + 30);
  }
  // the nets' wires
  let wid = 0;
  for (const n of circuit.nets) {
    const src = n.driver ? pins.get(n.driver).out : portOf(n);
    if (!src) continue;
    const targets = [...n.sinks.map(k => pins.get(k.gate).ins[k.pin]), ...(n.dir === 'out' ? [portOf(n)] : [])].filter(Boolean)
      .sort((a, b) => Math.hypot(a.x - src.x, a.y - src.y) - Math.hypot(b.x - src.x, b.y - src.y));
    const mine = [];
    for (const t of targets) {
      const g = wireGrid(doc);
      // from the source, else to the net's nearest wire point (a T junction)
      let path = routePath(g, { x: src.x, y: src.y }, { x: t.x, y: t.y });
      if (!path) {
        const on = mine.flatMap(w => w.points.slice(1).flatMap((p, i) => segPoints(w.points[i], p))).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
        for (const p of on.slice(0, 12)) if ((path = routePath(g, { x: t.x, y: t.y }, p))) break;
      }
      if (!path) {
        const mx = snap((src.x + t.x) / 2);
        path = cleanPath([src, { x: mx, y: src.y }, { x: mx, y: t.y }, t].map(p => ({ x: p.x, y: p.y })));
        warnings.push(`A wire of ${n.name || `${n.driver}'s output`} could not be routed clear of the others: check it.`);
      }
      const w = { id: `W${++wid}`, points: path.map(p => ({ x: p.x, y: p.y })) };
      doc.wires.push(w);
      mine.push(w);
    }
  }
  const all = [...doc.symbols.map(s => symbolBox(s, {}, symbolDef(s))), ...doc.ports.map(portBox)];
  doc.sheet = { w: Math.max(1100, Math.ceil((Math.max(...all.map(b => b.x + b.w)) + 100) / 100) * 100), h: Math.max(800, Math.ceil((Math.max(...all.map(b => b.y + b.h)) + 100) / 100) * 100) };
  // the branches of the nets as wire ends, where they connect (#678)
  joinOnWires(doc);
  return { doc, warnings };
}
