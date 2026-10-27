// Two documents side by side (#1619): the workspace split in two panes, a divider between them. Each pane shows one
// open document; the one in front (S.active) is the pane worked in, a click on the other brings it to the front, and
// a document opened (the Design pane, a tab) takes the place of the one in front. Show Generated HDL Beside opens a
// drawing's HDL file, or a C source's HDL, in the other pane, read-only as always: it follows the drawing as it is
// saved (refreshOpenEditor, web/js/drawings.js; the C's, web/js/c-source.js openCHdl). Closing either document, or
// Close Split, leaves one. The pair is kept with the open documents (app.js saveViewState). A narrow workspace stacks
// the panes.
import { h, toast } from './ui.js';
import { S, activateDoc, openFile, saveViewState } from './app.js';
import { openCHdl, isC } from './c-source.js';
import { taskOfDoc } from './tasks.js';
import { prefKey } from './prefs.js';

const RATIO_KEY = 'silinx.split.ratio';
const NARROW = 720;   // (a workspace narrower than this: the panes one above the other)
const $ = id => document.getElementById(id);

let pair = null;      // { a, b }: the documents of the left (top) and right (bottom) panes
let opening = null;   // while a document is opened beside this one (openBeside)
let divider = null, watched = false;
let ratio = (() => { try { const r = parseFloat(localStorage.getItem(prefKey(RATIO_KEY))); return r > 0.1 && r < 0.9 ? r : 0.5; } catch { return 0.5; } })();

const tasks = () => document.documentElement.dataset.layout === 'tasks';
const taskOf = d => d.task || taskOfDoc(d.id);
const inPair = d => !!pair && (pair.a === d || pair.b === d);
/** The documents shown side by side ({ a, b }), or null. */
export const splitPair = () => (shown() ? { ...pair } : null);
// (in the Tasks interface, only while the document in front is of the pair, both of its task)
const shown = () => !!pair && inPair(S.active) && (!tasks() || taskOf(pair.a) === taskOf(pair.b));

/** activateDoc's placement (app.js): `doc` brought to the front, `prev` the one in front before. A document of the pair
 *  is focused; another takes the place of the pane in front (`prev`'s), or opens beside `opening`; else it is shown alone,
 *  the pair kept for later. */
export function placeSplit(doc, prev) {
  if (opening && doc !== opening) pair = pair?.b === opening ? { a: doc, b: opening } : { a: opening, b: doc };
  else if (pair && !inPair(doc) && inPair(prev) && (!tasks() || taskOf(doc) === taskOf(prev))) pair = pair.a === prev ? { a: doc, b: pair.b } : { a: pair.a, b: doc };
  layout();
}

/** A document closed (app.js closeDoc): the split ends; the other document of the pair, to bring to the front. */
export function splitClosed(doc) {
  if (!inPair(doc)) return null;
  const other = pair.a === doc ? pair.b : pair.a;
  pair = null;
  layout();
  return other;
}

/** Opens a document (`open()`, its document or a promise of it) beside `base` (the one in front by default), `base`
 *  then in front again unless `focus`. */
export async function openBeside(open, { base = S.active, focus = false } = {}) {
  if (!base) return null;
  opening = base;
  let doc;
  try { doc = await open(); } finally { opening = null; }
  if (!doc || doc === base || !S.docs.includes(doc) || !S.docs.includes(base)) return doc;
  if (!inPair(doc) || !inPair(base)) pair = { a: base, b: doc };
  activateDoc(focus ? doc : base);
  return doc;
}

/** A tab's document beside the one in front (Open to the Side); the one in front itself: beside the last other one. */
export function openTabBeside(doc) {
  const base = doc !== S.active ? S.active : [...S.docs].reverse().find(d => d !== doc && (!tasks() || taskOf(d) === taskOf(doc)));
  if (!base) { toast('Open another document first: Open to the Side shows two documents side by side', 'info'); return null; }
  return openBeside(() => { activateDoc(doc); return doc; }, { base, focus: true });
}

/** The command opening the HDL generated from a document (a drawing's HDL file, a C source's HDL), or null. */
export function generatedOpener(doc) {
  const p = doc?.path || /^(?:sch|asm|tt|fsm|pn):(.+)$/.exec(String(doc?.id || ''))?.[1];
  if (!p) return null;
  const hdl = /\.(sch|asm|tt|fsm|pn)\.json$/.test(p) && S.schOwners?.[p];
  if (hdl) return () => openFile(hdl);
  if (isC(p) && S.sources.some(s => s.view && s.path === p)) return () => openCHdl(p);
  return null;
}

/** Show Generated HDL Beside: the generated HDL of `doc` in the other pane, `doc` kept in front. */
export function showGeneratedBeside(doc = S.active) {
  const open = generatedOpener(doc);
  if (!open) { toast('This document has no generated HDL to show beside it', 'info'); return null; }
  if (doc !== S.active) activateDoc(doc);
  return openBeside(open, { base: doc });
}

/** Close Split: the document in front alone. */
export function closeSplit() {
  if (!pair) return;
  pair = null;
  layout();
  saveViewState();
}

/** The commands of a document's tab and of the View menu. */
export function splitItems(doc = S.active) {
  const gen = generatedOpener(doc);
  return [
    '-',
    { label: 'Open to the Side', action: () => openTabBeside(doc), disabled: !doc || S.docs.length < 2 || (shown() && inPair(doc) && S.active !== doc) },
    gen ? { label: 'Show Generated HDL Beside', action: () => showGeneratedBeside(doc) } : null,
    shown() ? { label: 'Close Split', action: () => closeSplit() } : null,
  ].filter(Boolean);
}

// ---- kept with the open documents (app.js saveViewState, restoreViewState)
/** The pair's keys (`key`: a document's reopen key), when both are kept (`open`). */
export function splitKeys(key, open) {
  const k = pair && [key(pair.a), key(pair.b)];
  return k && k.every(x => open.includes(x)) ? k : null;
}
/** The kept pair back (`find`: a document by its key), before the one in front is brought there. */
export function restoreSplit(keys, find) {
  const [a, b] = Array.isArray(keys) ? keys.map(find) : [];
  pair = a && b && a !== b ? { a, b } : null;
}

// ---- on the page
function layout() {
  const ws = $('workspace');
  if (!ws) return;
  watch(ws);
  const on = shown();
  ws.classList.toggle('split', on);
  ws.classList.toggle('split-v', on && ws.clientWidth < NARROW);
  ws.style.setProperty('--split', `${(ratio * 100).toFixed(2)}%`);
  if (on && !divider) {
    divider = h('div', { id: 'split-divider', role: 'separator', title: 'Drag to resize the panes (double-click: halves)' });
    divider.addEventListener('pointerdown', drag);
    divider.addEventListener('dblclick', () => setRatio(0.5));
  }
  if (divider) { if (on) ws.append(divider); divider.hidden = !on; }
  for (const d of S.docs) {
    const side = on ? (d === pair.a ? 'a' : d === pair.b ? 'b' : null) : null;
    const appears = !!side && d !== S.active && d.el.hidden;
    d.el.classList.toggle('pane-a', side === 'a');
    d.el.classList.toggle('pane-b', side === 'b');
    d.el.classList.toggle('pane-front', !!side && d === S.active);
    d.el.hidden = d !== S.active && !side;
    d.tab.classList.toggle('beside', !!side && d !== S.active);
    if (appears) d.onActivate?.();   // (a text editor laid out again once shown)
  }
  dispatchEvent(new Event('resize'));
}

// a click in the other pane brings its document to the front; the workspace's width decides the stacking
function watch(ws) {
  if (watched) return;
  watched = true;
  ws.addEventListener('pointerdown', e => {
    if (!shown()) return;
    const d = [pair.a, pair.b].find(x => x.el.contains(e.target));
    if (d && d !== S.active) activateDoc(d);
  }, true);
  let wasV = null;
  new ResizeObserver(() => { const v = ws.clientWidth < NARROW; if (shown() && v !== wasV) { wasV = v; ws.classList.toggle('split-v', v); dispatchEvent(new Event('resize')); } }).observe(ws);
}

function setRatio(r) {
  ratio = Math.max(0.15, Math.min(0.85, r));
  $('workspace').style.setProperty('--split', `${(ratio * 100).toFixed(2)}%`);
  dispatchEvent(new Event('resize'));
}
function drag(e) {
  if (!e.isPrimary) return;
  e.preventDefault();
  const ws = $('workspace'), vertical = ws.classList.contains('split-v');
  try { divider.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
  document.body.classList.add(vertical ? 'resizing-v' : 'resizing-h');
  const mv = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const r = ws.getBoundingClientRect();
    setRatio(vertical ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width);
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    document.body.classList.remove('resizing-h', 'resizing-v');
    try { localStorage.setItem(prefKey(RATIO_KEY), String(ratio)); } catch { /* storage unavailable */ }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
