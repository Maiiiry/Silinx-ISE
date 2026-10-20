// Copy and paste of the state machine and Petri net drawings' selection (#677): Edit ▸ Cut / Copy / Paste of the
// ASM chart, FSM state diagram and Petri net editors, in the same drawing, another one of the project or of
// another project. Isomorphic (no DOM). (The schematic's: core/schclip.js.)
//
//   import { copyDrawing, pasteDrawing } from '/core/drawclip.js';
//   const clip = copyDrawing('asm', model, ['n1', 'n2']);
//   const { ids } = pasteDrawing('asm', model2, clip, { dx: 40, dy: 40 });   // model2 changed in place
//
// What is copied: the selected nodes (ASM boxes, FSM states, Petri places and transitions) and the edges whose
// two ends are copied (ASM connections, FSM transitions, self-loops included, Petri arcs). What is pasted: those,
// offset, with fresh ids and, for the named nodes (ASM states and always blocks, FSM states, Petri places and
// transitions), a name already used in the drawing made new: _1, _2… (case-insensitive, as VHDL is); pasted into
// a drawing with no initial state, the copy's initial state becomes its.

export const DRAWINGS = {
  asm: { nodes: [['nodes', 'n']], edges: ['edges', 'e'], named: n => n.type === 'state' || n.type === 'always' },
  fsm: { nodes: [['states', 's']], edges: ['transitions', 't'], named: () => true },
  petri: { nodes: [['places', 'p'], ['transitions', 't']], edges: ['arcs', 'a'], named: () => true },
};
const clone = o => JSON.parse(JSON.stringify(o));
const arr = v => (Array.isArray(v) ? v : []);
const isNum = v => Number.isFinite(Number(v));

/** The clipboard contents of the nodes ids of model: { version, kind, from, lang, <node lists>, <edges> }. */
export function copyDrawing(kind, model, ids) {
  const K = DRAWINGS[kind];
  const want = new Set(ids || []);
  const out = { version: 1, kind, from: model.name, lang: model.lang };
  const copied = new Set();
  for (const [key] of K.nodes) { out[key] = arr(model[key]).filter(n => want.has(n.id)); out[key].forEach(n => copied.add(n.id)); }
  out[K.edges[0]] = arr(model[K.edges[0]]).filter(e => copied.has(e.from) && copied.has(e.to));
  if (model.initial != null && copied.has(model.initial)) out.initial = model.initial;   // (ASM, FSM)
  return clone(out);
}

/** Whether a clipboard has a node to paste. */
export const drawingClipEmpty = (kind, clip) => !clip || !DRAWINGS[kind].nodes.some(([key]) => arr(clip[key]).some(n => n && n.id != null));

/** Paste clip into model (changed in place), offset by (dx, dy). Returns { ids: [new node ids], edges: [new edge
 *  ids], renamed: Map(old name -> new name) }. */
export function pasteDrawing(kind, model, clip, { dx = 0, dy = 0 } = {}) {
  const K = DRAWINGS[kind];
  const res = { ids: [], edges: [], renamed: new Map() };
  if (drawingClipEmpty(kind, clip)) return res;
  const allIds = () => new Set([...K.nodes.flatMap(([key]) => arr(model[key])), ...arr(model[K.edges[0]])].map(o => o.id));
  const used = allIds();
  const newId = pfx => { let i = 1; while (used.has(`${pfx}${i}`)) i++; used.add(`${pfx}${i}`); return `${pfx}${i}`; };
  const names = new Set(K.nodes.flatMap(([key]) => arr(model[key])).filter(K.named).map(n => String(n.name ?? '').toLowerCase()));
  const map = new Map();   // old id -> new id
  for (const [key, pfx] of K.nodes) {
    model[key] = arr(model[key]);
    for (const n0 of arr(clip[key])) {
      if (!n0 || n0.id == null) continue;
      const n = { ...clone(n0), id: newId(pfx), x: (isNum(n0.x) ? Number(n0.x) : 0) + dx, y: (isNum(n0.y) ? Number(n0.y) : 0) + dy };
      if (K.named(n) && n.name) {
        const base = String(n.name);
        if (names.has(base.toLowerCase())) { let k = 1; while (names.has(`${base}_${k}`.toLowerCase())) k++; n.name = `${base}_${k}`; res.renamed.set(base, n.name); }
        names.add(n.name.toLowerCase());
      }
      map.set(String(n0.id), n.id);
      model[key].push(n); res.ids.push(n.id);
    }
  }
  const [ekey, epfx] = K.edges;
  model[ekey] = arr(model[ekey]);
  for (const e0 of arr(clip[ekey])) {
    if (!e0 || !map.has(String(e0.from)) || !map.has(String(e0.to))) continue;
    const e = { ...clone(e0), id: newId(epfx), from: map.get(String(e0.from)), to: map.get(String(e0.to)) };
    if (Array.isArray(e.points)) e.points = e.points.map(p => ({ x: Number(p.x) + dx, y: Number(p.y) + dy }));
    model[ekey].push(e); res.edges.push(e.id);
  }
  // a drawing with no initial state (a new one, emptied): the copy's initial state is its own
  const hasNode = id => K.nodes.some(([key]) => model[key].some(n => n.id === id));
  if ('initial' in model && clip.initial != null && map.has(String(clip.initial)) && !(model.initial && hasNode(model.initial))) model.initial = map.get(String(clip.initial));
  return res;
}
