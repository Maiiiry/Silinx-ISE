// Silinx - FSM state diagram editor (bubble diagrams, documents <name>.fsm.json; SVG, no framework).
//
//   import { mountFsmEditor } from './fsm-editor.js';
//   const ed = mountFsmEditor(container, { model, onChange(model), linkInfo() -> { file, why } | null,
//                                          onOpenFile(path), onTruthTables(), onToAsm() });
//   ed.getModel(); ed.setModel(m); ed.setLink(file); ed.refreshLink(); ed.fit(); ed.print(); ed.destroy();
//
// States are circles (the initial state has a double circle and an entry arrow); transitions are
// curved arrows labelled "condition / outputs" (Mealy outputs) — Moore outputs are written inside
// the circles. Double-click the background to add a state, drag from the rim of a state to another
// state (or to itself) to add a transition, double-click a state or a label to edit it in place,
// drag a label to bend its arrow. The bottom panel shows the tables (transition table, state
// table, encoded table for the binary / gray encodings), the generated HDL and a step-by-step
// simulation of the diagram (current state highlighted, inputs set by hand, clock steps).
// Model, validation, tables and HDL: core/fsm.js. Styles: asm-editor.css (shared look) + fsm-editor.css.

import { h, downloadText, undoButton, linkModel, linkSnapshot, twoFingerView } from './ui.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { svgSnapshot, printDiagram } from './print.js';
import {
  normalizeFsm, newFsm, validateFsm, generateFsm, parseLabel, parseOutputs, formatOutputs,
  transitionTable, stateTable, encodedTable, toCsv, stepFsm, autoLayout, FSM_ENCODINGS, STATE_R,
} from '/core/fsm.js';
import { highlightHdl } from './highlight.js';
import { mountSide } from './fsm-side.js';
import { mountRender } from './fsm-render.js';
import { copyDrawing, pasteDrawing, drawingClipEmpty } from '/core/drawclip.js';
import { writeClip, readClip, pasteFromKey, hasClip } from './clipboard.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = 20;
let instances = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of kids) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
const CHW = 7.3;                       // width of a 12px monospace character
export const textW = (s) => String(s).length * CHW;

/** Radius of a state circle (grows with its texts). */
export function radiusOf(s) {
  const outs = formatOutputs(s.outputs);
  return Math.max(STATE_R, Math.ceil(textW(s.name) * 1.1 / 2) + 12, Math.ceil(textW(outs) / 2) + 10);
}

export function mountFsmEditor(container, opts = {}) {
  const uid = `fsm${++instances}`;
  let M = normalizeFsm(opts.model || newFsm('fsm'));
  let sel = null;                      // { type: 'state' | 'trans', id }
  let view = { tx: 40, ty: 40, k: 1 };
  // the view fitted once, when the canvas first has a size, or the user's from the first press or zoom: a first
  // fit coming late (the canvas sized on a slow machine) moved the drawing under the pointer while it dragged (#339)
  let fitted = false;
  let hist = [JSON.stringify(M)], hi = 0, lastKey = null, lastT = 0;
  let diags = [];
  let drag = null;
  let destroyed = false;
  let panel = null;                    // 'tables' | 'code' | 'sim' | null
  let sim = null;                      // { state, inputs: {}, trace: [], timer }
  const timers = {};

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor fsm-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });
  const select = (cls, title, items, onchange) => {
    const s = h('select', { class: `asm-select ${cls}`, title, onchange: () => onchange(s.value) }, ...items.map(([v, l]) => h('option', { value: v }, l)));
    return s;
  };

  // ---------------------------------------------------------------------------- toolbar
  const typeSel = select('fsm-type', 'Moore machine: outputs depend on the state only (written in the circles). Mealy machine: outputs also on the transitions (condition / outputs).',
    [['moore', 'Moore'], ['mealy', 'Mealy']], (v) => { M.type = v; commit('type'); renderSide(); });
  const encSel = select('fsm-enc', 'State encoding', FSM_ENCODINGS.map((e) => [e, { binary: 'Binary', gray: 'Gray', onehot: 'One-hot', enum: 'Enumerated' }[e]]),
    (v) => { M.encoding = v; commit('enc'); });
  const styleSel = select('fsm-style', 'Style of the generated HDL', [['3process', '3 processes'], ['2process', '2 processes']], (v) => { M.style = v; commit('style'); });
  const langSel = select('fsm-lang', 'HDL language', [['vhdl', 'VHDL'], ['verilog', 'Verilog']], (v) => { M.lang = v; commit('lang'); });
  const undoBtn = undoButton('undo', () => undo());
  const redoBtn = undoButton('redo', () => redo());
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  const delBtn = btn('✕', 'Delete the selected state or transition (Del)', () => deleteSelection(), 'asm-danger');
  const tabBtns = {
    tables: btn('Tables', 'State table, transition table and encoded transition table', () => togglePanel('tables'), 'fsm-tab-btn'),
    code: btn('</> HDL', 'Show / hide the generated HDL', () => togglePanel('code'), 'fsm-tab-btn'),
    sim: btn('▶ Simulate', 'Step through the diagram: set the inputs, apply clock edges, see the state and the outputs', () => togglePanel('sim'), 'fsm-tab-btn'),
  };
  const linkHost = h('span', { class: 'fsm-link' });
  const toolbar = h('div', { class: 'asm-toolbar' },
    h('div', { class: 'asm-group' },
      btn([h('span', { class: 'fsm-ico-state' }), 'State'], 'Add a state (or double-click the drawing)', () => addState()),
      delBtn),
    sep(),
    h('div', { class: 'asm-group' }, undoBtn, redoBtn),
    sep(),
    h('div', { class: 'asm-group' },
      btn('Arrange', 'Automatic layout of the states', () => arrange()),
      btn('−', 'Zoom out', () => zoomBy(1 / 1.2)), zoomLbl, btn('+', 'Zoom in', () => zoomBy(1.2)),
      btn('Fit', 'Fit the diagram in the window', () => fit()),
      btn('🖨', 'Print the diagram / save it as PDF or SVG (Ctrl+P)', () => print())),
    sep(),
    h('div', { class: 'asm-group' }, typeSel, encSel, styleSel, langSel),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY }), tabBtns.tables, tabBtns.code, tabBtns.sim,
      btn('Convert to ASM chart', 'Make an ASM chart (.asm.json) of this state machine', () => opts.onToAsm?.())),
    linkHost);

  // ---------------------------------------------------------------------------- canvas
  const svg = sv('svg', { class: 'asm-canvas fsm-canvas' });
  svg.innerHTML = `
    <defs>
      <pattern id="${uid}-grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.9" class="asm-griddot"/></pattern>
      <marker id="${uid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 z" class="fsm-arrowhead"/></marker>
      <marker id="${uid}-arr-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 z" class="fsm-arrowhead sel"/></marker>
      <marker id="${uid}-arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 z" class="fsm-arrowhead hot"/></marker>
    </defs>
    <rect class="asm-bg fsm-bg" x="0" y="0" width="100%" height="100%" fill="url(#${uid}-grid)"/>
    <g class="fsm-vp"><g class="fsm-edges"></g><g class="fsm-states"></g><g class="fsm-overlay"></g></g>`;
  const vp = svg.querySelector('.fsm-vp');
  const gEdges = svg.querySelector('.fsm-edges'), gStates = svg.querySelector('.fsm-states'), gOverlay = svg.querySelector('.fsm-overlay');
  const pattern = svg.querySelector('pattern');
  const hint = h('div', { class: 'asm-hint' }, 'Double-click to add a state · drag from the rim of a state to another state to add a transition · double-click to edit · drag a label to bend its arrow · wheel to zoom');
  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg, hint);

  // bottom panel (tables / HDL / simulation)
  const panelTitle = h('span', { class: 'asm-code-title' });
  const panelTools = h('span', { class: 'fsm-panel-tools' });
  const panelBody = h('div', { class: 'fsm-panel-body' });
  const bottom = h('div', { class: 'asm-codepanel fsm-panel', hidden: true },
    h('div', { class: 'asm-codebar' }, panelTitle, panelTools, h('div', { class: 'asm-spacer' }), btn('✕', 'Close the panel', () => togglePanel(null))),
    panelBody);
  const mainCol = h('div', { class: 'asm-main' }, canvasWrap, bottom);

  // side panel
  const selSection = h('section', { class: 'asm-section fsm-selection' });
  const machineBody = h('div', { class: 'asm-section-body' });
  const machineSection = h('details', { class: 'asm-section', open: true }, h('summary', {}, 'Machine'), machineBody);
  const probList = h('ul', { class: 'asm-problems' });
  const probCount = h('span', { class: 'asm-prob-count' });
  const probSection = h('details', { class: 'asm-section fsm-problems', open: true }, h('summary', {}, 'Problems ', probCount), probList);
  const side = h('aside', { class: 'asm-side' }, selSection, machineSection, probSection);
  const statusMsg = h('span', { class: 'asm-status-msg' });
  const statusInfo = h('span', { class: 'asm-status-info' });
  root.append(toolbar, h('div', { class: 'asm-body' }, mainCol, side), h('div', { class: 'asm-status' }, statusInfo, statusMsg));

  // ---------------------------------------------------------------------------- model helpers
  const stateById = (id) => M.states.find((s) => s.id === id);
  const transById = (id) => M.transitions.find((t) => t.id === id);
  const newId = (p) => { const used = new Set([...M.states.map((s) => s.id), ...M.transitions.map((t) => t.id)]); let i = 1; while (used.has(`${p}${i}`)) i++; return `${p}${i}`; };
  const uniqueName = () => { const used = new Set(M.states.map((s) => s.name.toLowerCase())); let i = 0; while (used.has(`s${i}`)) i++; return `S${i}`; };
  const snapV = (v) => Math.round(v / (GRID / 2)) * (GRID / 2);

  function addState(at) {
    let p = at;
    if (!p) {
      const r = svg.getBoundingClientRect();
      p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      for (let k = 0; k < 40 && M.states.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 2 * STATE_R + 20); k++) p = { x: p.x + 60, y: p.y + (k % 2 ? 50 : 0) };
    }
    const s = { id: newId('s'), name: uniqueName(), x: snapV(p.x), y: snapV(p.y), outputs: {} };
    M.states.push(s);
    if (!M.initial) M.initial = s.id;
    sel = { type: 'state', id: s.id };
    commit();
    renderSide();
    flash(`State ${s.name} added`);
    return s;
  }
  function addTransition(from, to) {
    const t = { id: newId('t'), from, to, cond: '', outputs: {} };
    M.transitions.push(t);
    sel = { type: 'trans', id: t.id };
    commit();
    renderSide();
    setTimeout(() => editLabel(t), 0);
  }
  function deleteSelection() {
    if (!sel) return;
    if (sel.type === 'state') {
      M.states = M.states.filter((s) => s.id !== sel.id);
      M.transitions = M.transitions.filter((t) => t.from !== sel.id && t.to !== sel.id);
      if (M.initial === sel.id) M.initial = M.states[0]?.id ?? '';
    } else M.transitions = M.transitions.filter((t) => t.id !== sel.id);
    sel = null;
    commit();
    renderSide();
  }

  // Cut / Copy / Paste (#677, core/drawclip.js): the state selected with its self-loops, pasted offset and
  // selected, its name made new when it is used
  let pasteN = 0, pasteText = null;
  function copySel(cut = false) {
    if (sel?.type !== 'state') return;
    const clip = copyDrawing('fsm', M, [sel.id]);
    writeClip('fsm', clip);
    pasteText = JSON.stringify(clip); pasteN = 0;   // (pasted here: next to the original)
    if (cut) deleteSelection();
  }
  async function paste(clip) {
    clip ??= await readClip('fsm');
    if (drawingClipEmpty('fsm', clip) || destroyed) return;
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === M.name ? 0 : -1; }
    const d = 2 * GRID * ++pasteN;
    const { ids } = pasteDrawing('fsm', M, clip, { dx: d, dy: d });
    if (ids.length) sel = { type: 'state', id: ids[0] };
    commit('paste');
    renderSide();
    root.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- history
  function commit(key) {
    M = normalizeFsm(M);
    const snap = JSON.stringify(M);
    if (snap !== hist[hi]) {
      const now = Date.now();
      if (key && key === lastKey && now - lastT < 1500 && hi > 0) hist[hi] = snap;
      else { hist = hist.slice(0, hi + 1); hist.push(snap); hi++; if (hist.length > 300) { hist.shift(); hi--; } }
      lastKey = key; lastT = now;
      clearTimeout(timers.change);
      timers.change = setTimeout(() => { if (!destroyed) opts.onChange?.(clone(M)); }, 250);
    }
    render();
    validateSoon();
    updateToolbar();
    if (panel) renderPanel();
  }
  function restore(i) {
    hi = i;
    M = JSON.parse(hist[hi]);
    lastKey = null;
    if (sel && !(sel.type === 'state' ? stateById(sel.id) : transById(sel.id))) sel = null;
    render(); renderSide(); validateSoon(); updateToolbar(); if (panel) renderPanel();
    clearTimeout(timers.change);
    timers.change = setTimeout(() => { if (!destroyed) opts.onChange?.(clone(M)); }, 250);
  }
  const undo = () => { if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };
  function updateToolbar() {
    undoBtn.disabled = hi <= 0; redoBtn.disabled = hi >= hist.length - 1; delBtn.disabled = !sel;
    typeSel.value = M.type; encSel.value = M.encoding; styleSel.value = M.style; langSel.value = M.lang;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', panel === k);
    statusInfo.textContent = `${M.states.length} state(s), ${M.transitions.length} transition(s) · ${M.type === 'mealy' ? 'Mealy' : 'Moore'}`;
  }
  let flashTimer = null;
  function flash(msg, kind = '') {
    statusMsg.textContent = msg; statusMsg.className = `asm-status-msg ${kind}`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { statusMsg.textContent = ''; }, 4000);
  }

  // ---------------------------------------------------------------------------- view
  function applyView() {
    vp.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.k})`);
    pattern.setAttribute('patternTransform', `translate(${view.tx},${view.ty}) scale(${view.k})`);
    zoomLbl.textContent = `${Math.round(view.k * 100)}%`;
  }
  function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.tx) / view.k, y: (cy - r.top - view.ty) / view.k }; }
  function toScreen(x, y) { const r = svg.getBoundingClientRect(); return { x: r.left + view.tx + x * view.k, y: r.top + view.ty + y * view.k }; }
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k = clamp(view.k * f, 0.2, 4);
    fitted = true;
    view.tx = px - ((px - view.tx) * k) / view.k; view.ty = py - ((py - view.ty) * k) / view.k; view.k = k;
    applyView();
  }
  function zoomBy(f) { const r = svg.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
  function bounds() {
    if (!M.states.length) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const s of M.states) {
      const rr = radiusOf(s) + 26;
      l = Math.min(l, s.x - rr - (s.id === M.initial ? 40 : 0)); r = Math.max(r, s.x + rr); t = Math.min(t, s.y - rr); b = Math.max(b, s.y + rr);
    }
    for (const el of gEdges.querySelectorAll('.fsm-label-bg, .fsm-edge-line')) {
      try { const bb = el.getBBox(); if (bb.width || bb.height) { l = Math.min(l, bb.x - 8); t = Math.min(t, bb.y - 8); r = Math.max(r, bb.x + bb.width + 8); b = Math.max(b, bb.y + bb.height + 8); } } catch { /* not rendered */ }
    }
    return { l, t, r, b };
  }
  function fit() {
    const bb = bounds();
    const r = svg.getBoundingClientRect();
    if (!bb || r.width < 10 || r.height < 10) { view = { tx: 40, ty: 40, k: 1 }; applyView(); return; }
    const k = clamp(Math.min((r.width - 60) / (bb.r - bb.l), (r.height - 60) / (bb.b - bb.t)), 0.2, 1.5);
    view = { k, tx: (r.width - (bb.r - bb.l) * k) / 2 - bb.l * k, ty: (r.height - (bb.b - bb.t) * k) / 2 - bb.t * k };
    applyView();
  }
  function print() {
    const bb = bounds();
    if (!bb) return;
    const saved = sel; sel = null; render();
    let snap;
    try { snap = svgSnapshot(svg, vp, bb, ['.fsm-bg', '.fsm-overlay > *', 'defs pattern', '.fsm-hit']); } finally { sel = saved; render(); }
    printDiagram({ title: `State diagram ${M.name}`, snapshot: snap, filename: `${M.name}_fsm` });
  }
  function arrange() {
    const L = autoLayout(M);
    for (const s of M.states) { const p = L.states.find((x) => x.id === s.id); s.x = p.x; s.y = p.y; }
    for (const t of M.transitions) { delete t.bend; delete t.angle; }
    commit();
    requestAnimationFrame(fit);
  }

  // ---------------------------------------------------------------------------- geometry, rendering (fsm-render.js)
  const { encOf, geom, render } = mountRender({ state: () => ({ M, sel, diags, sim, destroyed }), uid, gEdges, gStates, stateById, updateToolbar });

  // ---------------------------------------------------------------------------- inline editing
  let inline = null;
  function closeInline(commitIt) {
    if (!inline) return;
    const { input, apply } = inline;
    inline = null;
    if (commitIt) apply(input.value);
    input.remove();
    root.focus({ preventScroll: true });
  }
  function inlineAt(world, value, apply, { width = 200 } = {}) {
    closeInline(true);
    const sc = toScreen(world.x, world.y);
    const wr = canvasWrap.getBoundingClientRect();
    const input = h('input', { type: 'text', class: 'asm-input mono fsm-inline', value, spellcheck: 'false' });
    input.style.left = `${clamp(sc.x - wr.left - width / 2, 4, wr.width - width - 4)}px`;
    input.style.top = `${clamp(sc.y - wr.top - 14, 4, wr.height - 32)}px`;
    input.style.width = `${width}px`;
    canvasWrap.append(input);
    inline = { input, apply };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeInline(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInline(false); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (inline?.input === input) closeInline(true); }, 0));
    input.focus(); input.select();
  }
  function editState(s) {
    const outs = formatOutputs(s.outputs);
    inlineAt({ x: s.x, y: s.y }, outs ? `${s.name} / ${outs}` : s.name, (v) => {
      const k = v.indexOf('/');
      const name = (k < 0 ? v : v.slice(0, k)).trim();
      const r = k < 0 ? { outputs: s.outputs } : parseOutputs(v.slice(k + 1));
      if (r.error) { flash(r.error, 'err'); return; }
      const cur = stateById(s.id);
      if (!cur) return;
      if (name) cur.name = name;
      cur.outputs = r.outputs;
      commit(); renderSide();
    }, { width: Math.max(140, textW(s.name) + 140) });
  }
  function editLabel(t) {
    const g = geom(t);
    if (!g) return;
    const o = formatOutputs(t.outputs);
    inlineAt(g.lab, M.type === 'mealy' || o ? `${t.cond}${o ? ` / ${o}` : (M.type === 'mealy' ? ' / ' : '')}` : t.cond, (v) => {
      const cur = transById(t.id);
      if (!cur) return;
      const p = parseLabel(v);
      if (p.error) { flash(p.error, 'err'); return; }
      cur.cond = p.cond;
      cur.outputs = p.outputs;
      commit(); renderSide();
    }, { width: 240 });
  }

  // ---------------------------------------------------------------------------- pointer
  const hitState = (w, rim = 0) => {
    for (let i = M.states.length - 1; i >= 0; i--) {
      const s = M.states[i];
      if (Math.hypot(w.x - s.x, w.y - s.y) <= radiusOf(s) + rim) return s;
    }
    return null;
  };
  const capture = (ev) => { try { svg.setPointerCapture(ev.pointerId); } catch { /* not an active pointer */ } };
  function onPointerDown(ev) {
    fitted = true;
    const sel0 = sel;
    const onItem = ev.target.closest('[data-state],[data-trans]');
    if (ev.button === 1 || (ev.button === 0 && !onItem)) {
      closeInline(true);
      if (sel) { sel = null; render(); renderSide(); }
      drag = { kind: 'pan', sel0, x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty };
      capture(ev);
      svg.classList.add('panning');
      return;
    }
    if (ev.button !== 0) return;
    root.focus({ preventScroll: true });
    // the state or transition is drawn again below (render): without this, Safari (WebKit) sends
    // the mousedown to the removed element and moves the keyboard focus to the page (Delete did nothing)
    ev.preventDefault();
    const w = toWorld(ev.clientX, ev.clientY);
    const tEl = ev.target.closest('[data-trans]');
    if (tEl) {
      const t = transById(tEl.dataset.trans);
      sel = { type: 'trans', id: t.id }; render(); renderSide();
      drag = { kind: 'bend', sel0, t, start: w, moved: false, bend: t.bend, angle: t.angle };
      capture(ev);
      return;
    }
    const sEl = ev.target.closest('[data-state]');
    if (sEl) {
      const s = stateById(sEl.dataset.state);
      const d = Math.hypot(w.x - s.x, w.y - s.y);
      const r = radiusOf(s);
      sel = { type: 'state', id: s.id }; render(); renderSide();
      if (d > r - 7) {
        drag = { kind: 'connect', sel0, from: s, start: w };
        svg.classList.add('connecting');
      } else drag = { kind: 'move', sel0, s, x: s.x, y: s.y, dx: w.x - s.x, dy: w.y - s.y, moved: false };
      capture(ev);
    }
  }
  function onPointerMove(ev) {
    if (!drag) {
      // the rim of a state shows where a transition can be drawn from
      const w = toWorld(ev.clientX, ev.clientY);
      const s = hitState(w, 6);
      const onRim = s && Math.hypot(w.x - s.x, w.y - s.y) > radiusOf(s) - 7;
      svg.classList.toggle('rim', !!onRim);
      return;
    }
    const w = toWorld(ev.clientX, ev.clientY);
    if (drag.kind === 'pan') {
      view.tx = drag.tx + ev.clientX - drag.x; view.ty = drag.ty + ev.clientY - drag.y; applyView();
    } else if (drag.kind === 'move') {
      drag.s.x = snapV(w.x - drag.dx); drag.s.y = snapV(w.y - drag.dy); drag.moved = true; render();
    } else if (drag.kind === 'bend') {
      const t = drag.t, g = geom(t);
      if (!g) return;
      if (!drag.moved && Math.hypot(w.x - drag.start.x, w.y - drag.start.y) < 4) return;
      drag.moved = true;
      const a = stateById(t.from);
      if (g.self) t.angle = Math.round(Math.atan2(w.y - a.y, w.x - a.x) * 180 / Math.PI / 5) * 5;
      else {
        const b = (w.x - g.mid.x) * g.n.x + (w.y - g.mid.y) * g.n.y;
        t.bend = Math.abs(b) < 8 ? 0 : Math.round(b);
      }
      render();
    } else if (drag.kind === 'connect') {
      gOverlay.textContent = '';
      const target = hitState(w, 8);
      const a = drag.from;
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      if (target) gStates.querySelector(`[data-state="${CSS.escape(target.id)}"]`)?.classList.add('drop');
      const u = Math.hypot(w.x - a.x, w.y - a.y) || 1;
      const p0 = { x: a.x + (w.x - a.x) / u * radiusOf(a), y: a.y + (w.y - a.y) / u * radiusOf(a) };
      gOverlay.append(sv('path', { class: 'asm-edge-temp', d: `M${p0.x},${p0.y} L${w.x},${w.y}`, 'marker-end': `url(#${uid}-arr-sel)` }));
      drag.target = target;
      drag.end = w;
    }
  }
  function onPointerUp(ev) {
    const d = drag;
    drag = null;
    svg.classList.remove('panning', 'connecting');
    gOverlay.textContent = '';
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
    if (!d) return;
    if (d.kind === 'move' && d.moved) commit('move');
    else if (d.kind === 'bend' && d.moved) commit('bend');
    else if (d.kind === 'connect') {
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      const moved = d.end && Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) > 6;
      if (d.target && moved) addTransition(d.from.id, d.target.id);
    }
  }
  // a second finger (#674): what the first one started undone, the selection as it was
  function cancelDrag() {
    const d = drag;
    drag = null;
    svg.classList.remove('panning', 'connecting');
    gOverlay.textContent = '';
    if (!d) return;
    for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
    if (d.kind === 'move') Object.assign(d.s, { x: d.x, y: d.y });
    else if (d.kind === 'bend') Object.assign(d.t, { bend: d.bend, angle: d.angle });
    sel = d.sel0;
    render(); renderSide();
  }
  function onDblClick(ev) {
    const tEl = ev.target.closest('[data-trans]');
    if (tEl) { editLabel(transById(tEl.dataset.trans)); return; }
    const sEl = ev.target.closest('[data-state]');
    if (sEl) { editState(stateById(sEl.dataset.state)); return; }
    const s = addState(toWorld(ev.clientX, ev.clientY));
    setTimeout(() => editState(s), 0);
  }
  function onWheel(ev) { ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX, ev.clientY); }
  function onKeyDown(ev) {
    if (ev.target.closest('input, textarea, select')) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key;
    if (mod && (k === 'z' || k === 'Z')) { if (ev.shiftKey) redo(); else undo(); ev.preventDefault(); return; }
    if (mod && (k === 'y' || k === 'Y')) { redo(); ev.preventDefault(); return; }
    if (mod && (k === 'p' || k === 'P')) { print(); ev.preventDefault(); ev.stopPropagation(); return; }
    if (mod && (k === 'c' || k === 'C')) { copySel(); ev.preventDefault(); return; }
    if (mod && (k === 'x' || k === 'X')) { copySel(true); ev.preventDefault(); return; }
    if (mod && (k === 'v' || k === 'V')) { pasteFromKey('fsm', paste); return; }
    if (mod) return;
    if (k === 'Delete' || k === 'Backspace') { deleteSelection(); ev.preventDefault(); return; }
    if (k === 'F2' && sel) { if (sel.type === 'state') editState(stateById(sel.id)); else editLabel(transById(sel.id)); ev.preventDefault(); return; }
    if (k === '+' || k === '=') zoomBy(1.2);
    else if (k === '-') zoomBy(1 / 1.2);
    else if (k === '0') fit();
    else if (k === 'Escape' && sel) { sel = null; render(); renderSide(); }
  }
  twoFingerView(svg, { cancel: cancelDrag, pan: (dx, dy) => { view.tx += dx; view.ty += dy; applyView(); }, zoom: zoomAt });
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------------------- side panel (fsm-side.js)
  const { renderSide } = mountSide({ M: () => M, sel: () => sel, setSel: (s) => { sel = s; }, selSection, machineBody, btn, stateById, transById,
    encOf, commit, deleteSelection, render, updateToolbar });

  // ---------------------------------------------------------------------------- problems
  function validateSoon() { clearTimeout(timers.val); timers.val = setTimeout(runValidate, 120); }
  function runValidate() {
    if (destroyed) return;
    diags = validateFsm(M);
    probList.textContent = '';
    const n = (s) => diags.filter((d) => d.severity === s).length;
    probCount.textContent = diags.length ? `(${n('error')} error(s), ${n('warning')} warning(s))` : '';
    probCount.className = `asm-prob-count ${n('error') ? 'c-err' : n('warning') ? 'c-warn' : 'c-ok'}`;
    if (!diags.length) probList.append(h('li', { class: 'asm-prob ok' }, h('span', { class: 'asm-sev' }, '✓'), h('span', {}, 'No problems: the diagram is complete.')));
    for (const d of diags) {
      const li = h('li', { class: `asm-prob ${d.severity}${d.state || d.transition ? ' link' : ''}` },
        h('span', { class: 'asm-sev' }, d.severity === 'error' ? '✖' : d.severity === 'warning' ? '▲' : 'i'), h('span', { class: 'fsm-msg' }, d.message));
      if (d.transition || d.state) li.addEventListener('click', () => { sel = d.transition ? { type: 'trans', id: d.transition } : { type: 'state', id: d.state }; render(); renderSide(); });
      probList.append(li);
    }
    render();
    if (panel === 'code') renderPanel();
  }

  // ---------------------------------------------------------------------------- bottom panel
  function togglePanel(which) {
    panel = panel === which ? null : which;
    if (panel !== 'sim' && sim) stopRun();
    if (panel === 'sim' && !sim) resetSim();
    if (panel !== 'sim') { sim = null; }
    bottom.hidden = !panel;
    hint.hidden = !!panel;
    requestAnimationFrame(() => { if (!destroyed) fit(); });   // the drawing area changed size
    renderPanel();
    render();
    updateToolbar();
  }
  function renderPanel() {
    if (panel !== 'sim') { panelBody.textContent = ''; panelTools.textContent = ''; }
    if (!panel) return;
    if (panel === 'code') return renderCode();
    if (panel === 'tables') return renderTables();
    return renderSim();
  }
  function renderCode() {
    panelTitle.textContent = `${M.name}.${M.lang === 'verilog' ? 'v' : 'vhd'}`;
    const pre = h('pre', { class: 'asm-code fsm-code' });
    try {
      const g = generateFsm(M, M.lang);
      pre.innerHTML = highlightHdl(g.code, M.lang);
      panelTools.append(btn('Copy', 'Copy the code to the clipboard', () => navigator.clipboard?.writeText(g.code).then(() => flash('Code copied to the clipboard'), () => {}), 'asm-small'));
    } catch (e) {
      pre.classList.add('has-err');
      pre.textContent = `${e.message}`;
    }
    panelBody.append(pre);
  }
  function csvButton(name, rows) {
    return btn('Export CSV', 'Download this table as a CSV file (opens in a spreadsheet)', () => downloadText(name, toCsv(rows), 'text/csv'), 'asm-small');
  }
  function renderTables() {
    panelTitle.textContent = 'Tables';
    const wrap = h('div', { class: 'fsm-tables' });
    // transition table
    const tt = transitionTable(M);
    const showCode = M.encoding !== 'enum';
    const t1 = h('table', { class: 'fsm-table fsm-ttable' },
      h('tr', {}, h('th', {}, 'Present state'), showCode ? h('th', {}, 'Code') : null, h('th', {}, 'Input condition'), h('th', {}, 'Next state'), showCode ? h('th', {}, 'Next code') : null, h('th', {}, 'Outputs')),
      ...tt.rows.map((r) => h('tr', { class: r.stays ? 'stays' : '' }, h('td', {}, r.state), showCode ? h('td', { class: 'mono' }, r.code) : null,
        h('td', { class: 'mono' }, r.cond === 'otherwise' ? h('i', {}, 'otherwise (stays)') : r.cond), h('td', {}, r.next), showCode ? h('td', { class: 'mono' }, r.nextCode) : null, h('td', { class: 'mono' }, r.outputs))));
    wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'Transition table'), csvButton(`${M.name}_transitions.csv`, [tt.columns, ...tt.rows.map((r) => [r.state, r.code, r.cond, r.next, r.nextCode, r.outputs])])), t1);
    // state table (classic form)
    const st = stateTable(M);
    if (st) {
      const head = h('tr', {}, h('th', { rowspan: 2 }, 'Present state'), showCode ? h('th', { rowspan: 2 }, 'Code') : null,
        h('th', { colspan: st.combos.length }, `Next state, for the inputs ${st.inputs || '—'}`),
        M.type === 'mealy' ? h('th', { colspan: st.combos.length }, `Outputs ${st.outputs}`) : h('th', { rowspan: 2 }, `Outputs ${st.outputs}`));
      const head2 = h('tr', {}, ...st.combos.map((c) => h('th', { class: 'mono' }, c)), ...(M.type === 'mealy' ? st.combos.map((c) => h('th', { class: 'mono' }, c)) : []));
      const t2 = h('table', { class: 'fsm-table fsm-stable' }, head, head2,
        ...st.rows.map((r) => h('tr', {}, h('td', {}, r.state), showCode ? h('td', { class: 'mono' }, r.code) : null, ...r.next.map((n) => h('td', {}, n)),
          ...(M.type === 'mealy' ? r.outputs.map((o) => h('td', { class: 'mono' }, o)) : [h('td', { class: 'mono' }, r.moore)]))));
      const csv = [['Present state', 'Code', ...st.combos.map((c) => `next (${st.inputs}=${c})`), ...(M.type === 'mealy' ? st.combos.map((c) => `outputs (${st.inputs}=${c})`) : ['outputs'])],
        ...st.rows.map((r) => [r.state, r.code, ...r.next, ...(M.type === 'mealy' ? r.outputs : [r.moore])])];
      wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'State table'), csvButton(`${M.name}_states.csv`, csv)), t2);
    }
    // encoded table
    const et = encodedTable(M);
    if (et.error) wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'Encoded transition table')), h('p', { class: 'asm-muted' }, et.error));
    else {
      const cols = [...et.stateBits, ...et.inputBits, ...et.nextBits, ...et.outputBits];
      const t3 = h('table', { class: 'fsm-table fsm-etable' },
        h('tr', {}, h('th', { colspan: et.stateBits.length }, 'Present state'), et.inputBits.length ? h('th', { colspan: et.inputBits.length }, 'Inputs') : null,
          h('th', { colspan: et.nextBits.length }, 'Next state'), et.outputBits.length ? h('th', { colspan: et.outputBits.length }, 'Outputs') : null, h('th', { rowspan: 2 }, '')),
        h('tr', {}, ...cols.map((c) => h('th', { class: 'mono' }, c))),
        ...et.rows.map((r) => h('tr', { class: r.unused ? 'unused' : '' }, ...[...r.q, ...r.in, ...r.d, ...r.out].map((b, i) => h('td', { class: `mono${i === et.stateBits.length + et.inputBits.length ? ' sepl' : ''}` }, b)),
          h('td', { class: 'fsm-note' }, r.unused ? 'unused code' : `${r.state} → ${r.next}`))));
      const csv = [cols, ...et.rows.map((r) => [...r.q, ...r.in, ...r.d, ...r.out])];
      wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'Encoded transition table'), csvButton(`${M.name}_encoded.csv`, csv),
        btn('Create Truth Tables', 'Create truth tables (.tt.json) of the next-state bits and of the outputs, to simplify them with Karnaugh maps', () => opts.onTruthTables?.(), 'asm-small fsm-mktt')),
      h('p', { class: 'asm-muted' }, `${et.stateBits.join(' ')}: present state (flip-flop outputs), ${et.nextBits.join(' ')}: next state (D flip-flop inputs). Unused codes: X (don't care).`), t3);
    }
    panelBody.append(wrap);
  }

  // ---------------------------------------------------------------------------- simulation
  function resetSim() {
    stopRun();
    const inputs = Object.fromEntries(M.inputs.map((i) => [i.name, sim?.inputs?.[i.name] ?? 0]));
    sim = { state: M.initial, inputs, trace: [], cycle: 0, timer: null };
  }
  function stopRun() { if (sim?.timer) { clearInterval(sim.timer); sim.timer = null; } }
  function clockStep() {
    if (!sim || !stateById(sim.state)) resetSim();
    const r = stepFsm(M, sim.state, sim.inputs);
    sim.trace.push({ cycle: sim.cycle, state: stateById(sim.state)?.name, inputs: { ...sim.inputs }, outputs: r.outputs, next: stateById(r.next)?.name });
    if (sim.trace.length > 200) sim.trace.shift();
    sim.state = r.next; sim.cycle++;
    render(); renderPanel();
  }
  // the simulation's controls (⟲ Reset, Clock ↑, Run / Stop, the inputs) are made once and kept: drawn
  // again at every clock edge of Run, a click on ■ Stop or on an input whose press and release fell on
  // each side of an edge went to an element no longer there, and was lost (#240)
  const runBtn = btn('▶ Run', 'Apply a clock edge every second', () => {
    if (sim.timer) stopRun(); else sim.timer = setInterval(() => { if (destroyed || panel !== 'sim') return stopRun(); clockStep(); }, 1000);
    renderPanel();
  }, 'asm-small');
  const simTools = [btn('⟲ Reset', 'Back to the initial state', () => { resetSim(); render(); renderPanel(); }, 'asm-small fsm-sim-reset'),
    btn('Clock ↑', 'Apply one rising clock edge: the machine takes the transition shown in color', () => clockStep(), 'asm-small asm-primary fsm-sim-step'), runBtn];
  const simState = h('b', { class: 'fsm-sim-state' });
  const simNext = h('span', { class: 'asm-muted' });
  const simOuts = h('div', { class: 'fsm-sim-outputs' });
  const simTrace = h('div', { class: 'fsm-sim-trace' });
  let simIns = null;   // { key: the inputs (names, widths), el: their controls, set(): the controls show sim.inputs }
  function simInputs() {
    const key = JSON.stringify(M.inputs.map((i) => [i.name, i.width]));
    if (simIns?.key !== key) {
      const sets = [];
      const el = h('div', { class: 'fsm-sim-inputs' }, ...M.inputs.map((i) => {
        if (i.width === 1) {
          const b = h('button', { type: 'button', class: 'asm-btn fsm-bit', 'data-input': i.name, title: 'Click to toggle the input' });
          b.addEventListener('click', () => { sim.inputs[i.name] = sim.inputs[i.name] ? 0 : 1; render(); renderPanel(); });
          sets.push(() => {
            const t = `${i.name} = ${sim.inputs[i.name]}`;
            if (b.textContent !== t) b.textContent = t;
            b.classList.toggle('on', !!sim.inputs[i.name]);
          });
          return b;
        }
        const e = h('input', { type: 'number', class: 'asm-input fsm-bus', min: 0, max: 2 ** i.width - 1, 'data-input': i.name });
        e.addEventListener('change', () => { sim.inputs[i.name] = clamp(parseInt(e.value, 10) || 0, 0, 2 ** i.width - 1); render(); renderPanel(); });
        sets.push(() => { if (document.activeElement !== e) e.value = String(sim.inputs[i.name]); });
        return h('label', { class: 'fsm-busl' }, `${i.name} = `, e);
      }));
      simIns = { key, el, set: () => sets.forEach((f) => f()) };
    }
    simIns.set();
    return simIns.el;
  }
  let simView = null;   // the panel's body while simulating: its rows, kept
  function renderSim() {
    panelTitle.textContent = 'Simulation';
    if (!sim) resetSim();
    for (const i of M.inputs) if (!(i.name in sim.inputs)) sim.inputs[i.name] = 0;
    const errs = diags.filter((d) => d.severity === 'error');
    if (errs.length) {
      panelTools.textContent = '';
      panelBody.replaceChildren(h('p', { class: 'asm-muted c-err' }, 'Correct the errors of the diagram to simulate it.'));
      return;
    }
    const r = stepFsm(M, sim.state, sim.inputs);
    const runLabel = sim.timer ? '■ Stop' : '▶ Run';
    if (runBtn.dataset.label !== runLabel) { runBtn.dataset.label = runLabel; runBtn.textContent = runLabel; }
    if (panelTools.firstChild !== simTools[0] || panelTools.childNodes.length !== simTools.length) panelTools.replaceChildren(...simTools);
    const ins = simInputs();
    const insRow = ins.parentNode?.classList.contains('fsm-sim-row') ? ins.parentNode : null;
    if (!simView || !insRow || insRow.parentNode !== simView) {
      simView = h('div', { class: 'fsm-sim' },
        h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'State'), simState, simNext),
        h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Inputs'), ins),
        h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Outputs'), simOuts),
        simTrace);
    }
    if (panelBody.firstChild !== simView || panelBody.childNodes.length !== 1) panelBody.replaceChildren(simView);
    const cur = stateById(sim.state);
    simState.textContent = cur?.name ?? '?';
    simNext.textContent = r.transition ? `next clock edge → ${stateById(r.next)?.name}` : `no transition is true: stays in ${cur?.name ?? '?'}`;
    simOuts.replaceChildren(...M.outputs.map((o) => h('span', { class: `fsm-led${r.outputs[o.name] ? ' on' : ''}`, 'data-output': o.name },
      `${o.name} = ${o.width === 1 ? r.outputs[o.name] : r.outputs[o.name].toString(2).padStart(o.width, '0')}`)));
    simTrace.replaceChildren(...(sim.trace.length ? [h('table', { class: 'fsm-table fsm-trace' },
      h('tr', {}, h('th', {}, 'Cycle'), h('th', {}, 'State'), h('th', {}, 'Inputs'), h('th', {}, 'Outputs'), h('th', {}, 'Next state')),
      ...sim.trace.slice(-12).reverse().map((x) => h('tr', {}, h('td', {}, String(x.cycle)), h('td', {}, x.state), h('td', { class: 'mono' }, Object.entries(x.inputs).map(([k, v]) => `${k}=${v}`).join(' ')),
        h('td', { class: 'mono' }, Object.entries(x.outputs).map(([k, v]) => `${k}=${v}`).join(' ')), h('td', {}, x.next))))] : []));
  }

  // ---------------------------------------------------------------------------- link
  function refreshLink() {
    linkHost.textContent = '';
    const L = opts.linkInfo?.();
    if (!L) return;
    const a = h('a', { onclick: () => opts.onOpenFile?.(L.file) }, L.file.split('/').pop());
    linkHost.append(h('span', { class: `gen-banner${L.why ? ' out-of-sync' : ''}`, title: L.why || `HDL: ${L.file.split('/').pop()} — generated from the diagram` },
      L.why ? 'Not in sync with ' : 'HDL: ', a, L.why ? ` — ${L.why}` : ' — generated from the diagram'));
  }

  // ---------------------------------------------------------------------------- init
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!fitted) fitted = tryFit(); }) : null;
  const tryFit = () => { const r = svg.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return false; fit(); return true; };
  ro?.observe(svg);
  applyView();
  render();
  renderSide();
  runValidate();
  refreshLink();
  requestAnimationFrame(() => { if (!fitted) fitted = tryFit(); });

  return {
    getModel: () => clone(M),
    undo: () => undo(), redo: () => redo(),
    canUndo: () => hi > 0, canRedo: () => hi < hist.length - 1,
    // Edit ▸ Cut / Copy / Paste / Delete (#677): a state (a transition: Delete only)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => deleteSelection(),
    canCopy: () => sel?.type === 'state', canDelete: () => !!sel, canPaste: () => hasClip('fsm'),
    setModel(m) {
      closeInline(false);
      M = normalizeFsm(m);
      hist = [JSON.stringify(M)]; hi = 0; lastKey = null;
      if (sel && !(sel.type === 'state' ? stateById(sel.id) : transById(sel.id))) sel = null;
      if (sim && !stateById(sim.state)) resetSim();
      render(); renderSide(); runValidate(); refreshLink(); if (panel) renderPanel();
    },
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist = hist.map((s) => linkSnapshot(s, file, normalizeFsm)); refreshLink(); },
    refreshLink,
    validate: () => { runValidate(); return diags.slice(); },
    showPanel: (p) => { if (panel !== p) togglePanel(p); },
    fit,
    print,
    destroy() {
      destroyed = true;
      stopRun();
      Object.values(timers).forEach(clearTimeout);
      clearTimeout(flashTimer);
      ro?.disconnect();
      root.remove();
    },
  };
}

export default mountFsmEditor;
