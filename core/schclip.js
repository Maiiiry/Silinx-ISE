// Copy and paste of a schematic's selection (#677): Edit ▸ Cut / Copy / Paste of the schematic editor, in the
// same sheet, in another schematic of the project or in another project. Isomorphic (no DOM).
//
//   import { copySchematic, pasteSchematic } from '/core/schclip.js';
//   const clip = copySchematic(doc, { symbols: [ids], wires: [ids], ports: [ids], labels: [ids] }, modules);
//   const { ids } = pasteSchematic(doc2, clip, { dx: 40, dy: 40 });   // doc2 changed in place, ids: what was pasted
//
// What is copied: the selected symbols, wires, net names and I/O markers, with the wires that join the copied
// parts although they are not selected (the wires of a net whose every end is on a copied pin, marker or wire)
// and the net names on the wires copied. A wire that leads to a part left behind is not carried along: the
// copy keeps its connections to the copied parts only.
//
// What is pasted: everything offset by (dx, dy), with fresh ids, and names that collide with nothing of the
// sheet: an instance name already used gets the next inst_n; an I/O marker's name already used gets _1, _2…;
// a net name already used in the sheet gets _1, _2… too (the same new name for every label of that net, so
// the copy's own nets stay joined). A net name of an I/O marker of the sheet that is not pasted is kept: the
// copy connects to that port (the clk of the sheet, say), as a label of that name drawn by hand does.
import { DOC_VERSION, GRID, normalizeDoc, symbolPins, parseNetName } from './schdoc.js';

const CLIP_VERSION = 1;
const clone = o => JSON.parse(JSON.stringify(o));
const key = (x, y) => `${x},${y}`;
function onSeg(p, a, b) {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) < 1e-6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}
const onWire = (p, w) => w.points.some((q, i) => i + 1 < w.points.length && onSeg(p, q, w.points[i + 1]));
const ends = w => [w.points[0], w.points[w.points.length - 1]];

/** The clipboard contents of a selection of doc: { version, docVersion, lang, from, symbols, wires, ports, labels }. */
export function copySchematic(doc, sel, modules = {}) {
  const pick = (arr, ids) => { const s = new Set(ids || []); return arr.filter(o => s.has(o.id)); };
  const symbols = pick(doc.symbols, sel.symbols), ports = pick(doc.ports, sel.ports);
  const wires = pick(doc.wires, sel.wires);
  // the points of the copied parts: their pins and the markers' connection points
  const anchors = new Set([...symbols.flatMap(s => symbolPins(s, modules).map(p => key(p.x, p.y))), ...ports.map(p => key(p.x, p.y))]);
  // the wires not selected that join them: every end of such a wire is on a copied part or on another such
  // wire (or a selected one); the wires with an end elsewhere are dropped, and so, in turn, the wires that
  // only lean on those, until nothing changes
  const chosen = new Set(wires.map(w => w.id));
  let cand = doc.wires.filter(w => !chosen.has(w.id));
  for (let changed = true; changed;) {
    changed = false;
    const live = [...wires, ...cand];
    cand = cand.filter(w => {
      const ok = ends(w).every(e => anchors.has(key(e.x, e.y)) || live.some(o => o !== w && onWire(e, o)));
      if (!ok) changed = true;
      return ok;
    });
  }
  // … and among them only those reaching a copied part or a selected wire (not a loose group of wires)
  const reach = new Set();
  const touches = (a, b) => ends(a).some(e => onWire(e, b)) || ends(b).some(e => onWire(e, a));
  const queue = cand.filter(w => w.points.some(p => anchors.has(key(p.x, p.y))) || wires.some(o => touches(w, o)));
  for (const w of queue) reach.add(w.id);
  while (queue.length) {
    const w = queue.shift();
    for (const o of cand) if (!reach.has(o.id) && touches(w, o)) { reach.add(o.id); queue.push(o); }
  }
  const allWires = [...wires, ...cand.filter(w => reach.has(w.id))];
  // the net names: those selected, and those on a copied wire
  const lsel = new Set(sel.labels || []);
  const labels = doc.labels.filter(l => lsel.has(l.id) || allWires.some(w => onWire(l, w)));
  return clone({ version: CLIP_VERSION, docVersion: DOC_VERSION, lang: doc.lang, from: doc.name, symbols, wires: doc.wires.filter(w => allWires.includes(w)), ports, labels });
}

/** Whether a clipboard has something to paste. */
export const clipEmpty = clip => !clip || !['symbols', 'wires', 'ports', 'labels'].some(k => Array.isArray(clip[k]) && clip[k].length);

/** Paste clip into doc (changed in place), offset by (dx, dy) (snapped to the grid). Returns
 *  { ids: { symbols, wires, ports, labels }, renamed: { instances, ports, nets }: Maps of old -> new names }. */
export function pasteSchematic(doc, clip, { dx = 0, dy = 0 } = {}) {
  // (a clipboard from the system's, read as text: normalized as a document is, nothing kept that is not one)
  // (its symbols drawn as in the document copied from, docVersion: one copied before #1136 has narrower multiplexers)
  const c = normalizeDoc({ version: +clip?.docVersion || 3, lang: doc.lang, symbols: clip?.symbols, wires: clip?.wires, ports: clip?.ports, labels: clip?.labels });
  dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID;
  const ci = doc.lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  const ids = { symbols: [], wires: [], ports: [], labels: [] };
  const renamed = { instances: new Map(), ports: new Map(), nets: new Map() };
  const nextId = (prefix, arr) => { let n = 0; for (const o of arr) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(o.id); if (m) n = Math.max(n, +m[1]); } return `${prefix}${n + 1}`; };

  // instances: a name used in the sheet gets the next inst_n (#311)
  const usedInst = new Set(doc.symbols.map(s => nk(s.name)));
  let n = 0;
  for (const s of doc.symbols) { const m = /^(?:inst|XLXI)_(\d+)$/.exec(s.name); if (m) n = Math.max(n, +m[1]); }
  for (const s0 of c.symbols) {
    const s = { ...s0, id: nextId('S', doc.symbols), x: s0.x + dx, y: s0.y + dy };
    if (!s.name || usedInst.has(nk(s.name))) { let nm; do nm = `inst_${++n}`; while (usedInst.has(nk(nm))); renamed.instances.set(s0.name, nm); s.name = nm; }
    usedInst.add(nk(s.name));
    doc.symbols.push(s); ids.symbols.push(s.id);
  }
  // the names taken in the sheet: its markers and its net names (they join what has the same name)
  const portNames = new Set(doc.ports.map(p => nk(p.name)));
  const taken = new Set([...portNames, ...doc.labels.map(l => nk(parseNetName(l.net).base))]);
  const fresh = base => { let k = 1; while (taken.has(nk(`${base}_${k}`))) k++; const nm = `${base}_${k}`; taken.add(nk(nm)); return nm; };
  // I/O markers: a name used gets _1, _2…
  for (const p0 of c.ports) {
    const p = { ...p0, id: nextId('P', doc.ports), x: p0.x + dx, y: p0.y + dy };
    if (taken.has(nk(p.name))) { p.name = fresh(p0.name); renamed.ports.set(nk(p0.name), p.name); } else taken.add(nk(p.name));
    doc.ports.push(p); ids.ports.push(p.id);
  }
  // net names: the name of a pasted marker follows it; the name of a marker of the sheet is kept (it joins
  // that port); another name used in the sheet gets a fresh one, the same for all the labels of that net
  const copiedPorts = new Set(c.ports.map(p => nk(p.name)));
  for (const l0 of c.labels) {
    const { base } = parseNetName(l0.net);
    const b = nk(base);
    let nb = base;
    if (copiedPorts.has(b)) nb = renamed.ports.get(b) ?? base;
    else if (renamed.nets.has(b)) nb = renamed.nets.get(b);
    else if (portNames.has(b)) nb = base;
    else if (taken.has(b) && !renamed.nets.has(b)) { nb = fresh(base); renamed.nets.set(b, nb); }
    else { renamed.nets.set(b, base); taken.add(b); }
    const l = { ...l0, id: nextId('L', doc.labels), x: l0.x + dx, y: l0.y + dy, net: nb === base ? l0.net : l0.net.replace(/^\s*[A-Za-z_][\w$]*/, nb) };
    doc.labels.push(l); ids.labels.push(l.id);
  }
  for (const [k, v] of [...renamed.nets]) if (nk(v) === k) renamed.nets.delete(k);
  for (const w0 of c.wires) {
    const w = { ...w0, id: nextId('W', doc.wires), points: w0.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    doc.wires.push(w); ids.wires.push(w.id);
  }
  return { ids, renamed };
}
