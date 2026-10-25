// UI: ISim's wave window, its pointer and keys (web/js/isim-input.js, #405: out of mountISim), mounted alone in the
// page on two canvases of its own, with the rows and the view given and the window's actions recorded: the selection
// in the names (a click, Ctrl, Shift), a group's twisty, the drag of a row into an open group, a double click, the
// cursor snapped to a transition (or not, with Shift), a marker dragged on the ruler, the menu and the keys.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// rows: A (1 bit, transitions at 1 and 2 ns), B, a group G (open, empty), a divider D; the names at (0, 0), the waves at
// (400, 0), 400 pixels wide, rows 20 pixels high under a 30-pixel ruler; 10 ps a pixel from 0; the simulation at 4 ns, a marker at 3 ns
const MOUNT = async () => {
  const { mountInput } = await import('/js/isim-input.js');
  const V = await import('/core/values.js');
  const canvas = (left) => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200; c.tabIndex = 0;
    Object.assign(c.style, { position: 'fixed', left: `${left}px`, top: '0px', width: '400px', height: '200px' });
    document.body.append(c);
    return c;
  };
  const cn = canvas(0), cw = canvas(400);
  const vsc = document.createElement('div'), splitNames = document.createElement('div');
  splitNames.className = 'isim-split-names';
  document.body.append(vsc, splitNames);
  const logic = (w) => ({ kind: 'logic', w, s: false });
  const sigA = { name: 'A', t: logic(1), wave: { t: [0, 1000, 2000], v: [V.ZERO, V.ONE, V.ZERO] } };
  const sigB = { name: 'B', t: logic(1), wave: { t: [0], v: [V.ZERO] } };
  const st = { rows: [{ id: 1, kind: 'sig', sig: sigA, name: 'A' }, { id: 2, kind: 'sig', sig: sigB, name: 'B' },
    { id: 3, kind: 'group', name: 'G', expanded: true }, { id: 4, kind: 'div', name: 'D' }],
  sel: new Set(), anchor: null, cursor: 0, markers: [{ id: 1, t: 3000 }], activeMarker: null, t0: 0, scale: 10, fit: false, nameW: 180, valW: 120,
  scrollY: 0, stim: { on: false } };
  let flat = [];
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a.map((x) => x?.name ?? x)]); };
  const rebuildFlat = () => { calls.push(['rebuildFlat']); flat = st.rows.map((row) => ({ row, bit: null, key: String(row.id), depth: row.group != null ? 1 : 0 })); };
  rebuildFlat(); calls.length = 0;
  const on = (el, ev, fn, o) => el.addEventListener(ev, fn, o);
  const track = (el, e, mm, mu) => {
    const move = (ev) => { if (ev.pointerId === e.pointerId) mm(ev); };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    const up = (ev) => { if (ev.pointerId !== e.pointerId) return; stop(); mu(ev); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return stop;
  };
  let menu = null;
  const input = mountInput({ st, sim: { now: 4000 }, $: (s) => document.querySelector(s), on, track, cn, cw, vsc,
    treeEl: document.createElement('ul'), objBody: document.createElement('tbody'), flat: () => flat, sizes: () => ({ NH: 200, WH: 200, WW: 400 }),
    layout: rec('layout'), invalidate: () => {}, rebuildFlat, updateVScroll: () => {}, objectsChanged: rec('objectsChanged'),
    xOf: (t) => (t - st.t0) / st.scale, tOf: (x) => st.t0 + x * st.scale, clampView: () => {}, zoomAt: rec('zoomAt'), zoomFit: rec('zoomFit'),
    itemWave: (it) => it.row.sig?.wave || null, setCursor: (t) => { st.cursor = Math.max(0, Math.round(t)); },
    addMarker: rec('addMarker'), removeMarker: rec('removeMarker'), jumpEdge: rec('jumpEdge'),
    selectedItems: () => flat.filter((f) => st.sel.has(f.key)), removeSelectedRows: rec('removeSelectedRows'), renameDivider: rec('renameDivider'),
    openSource: rec('openSource'), showMenu: (x, y, items) => { menu = items; }, waveRowMenu: () => [{ label: 'Row Menu' }],
    stimClick: rec('stimClick') });
  const ptr = (el, type, x, y, o = {}) => (type === 'pointerdown' ? el : window).dispatchEvent(new PointerEvent(type,
    { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, ...o }));
  const click = (el, x, y, o) => { ptr(el, 'pointerdown', x, y, o); ptr(el, 'pointerup', x, y, o); };
  const key = (k, o = {}) => cw.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const sel = () => [...st.sel].sort();
  window.__inp = { input, st, calls, cn, cw, ptr, click, key, sel, menu: () => menu, flat: () => flat };
  return true;
};

uiTest('#405 ISim wave window: the names (a click, Ctrl, Shift, a group\'s twisty, a row dragged into an open group, a double click)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { input, st, calls, cn, ptr, click, sel, flat } = window.__inp;
    const r = {};
    r.rowAt = [input.rowAtY(10), input.rowAtY(40), input.rowAtY(105), input.rowAtY(115)];
    click(cn, 100, 40); r.one = sel();
    click(cn, 100, 80, { ctrlKey: true }); r.ctrl = sel();
    click(cn, 100, 60, { shiftKey: true }); r.shift = sel();
    // a group's twisty: closed, then open again
    click(cn, 8, 80); r.closed = st.rows[2].expanded;
    click(cn, 8, 80); r.open = st.rows[2].expanded;
    r.twisty = calls.splice(0);
    // A dragged under the open group (before D): into the group
    ptr(cn, 'pointerdown', 100, 40);
    ptr(cn, 'pointermove', 100, 95);
    r.drag = input.dragRow();
    ptr(cn, 'pointerup', 100, 95);
    r.dropped = input.dragRow();
    r.rows = st.rows.map((x) => x.name);
    r.group = st.rows.find((x) => x.name === 'A').group;
    r.depths = flat().map((f) => f.depth);
    calls.splice(0);
    // double clicks: the divider renamed, a signal's source (B, first now)
    cn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 100 }));
    cn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 40 }));
    r.dbl = calls.splice(0);
    return r;
  });
  assert.deepEqual(out.rowAt, [-1, 0, 3, -1]);
  assert.deepEqual(out.one, ['1']);
  assert.deepEqual(out.ctrl, ['1', '3']);
  assert.deepEqual(out.shift, ['2', '3']);
  assert.equal(out.closed, false);
  assert.equal(out.open, true);
  assert.deepEqual(out.twisty, [['rebuildFlat'], ['rebuildFlat']]);
  assert.deepEqual(out.drag, { y: 60, flatIdx: 3 });
  assert.equal(out.dropped, null);
  assert.deepEqual(out.rows, ['B', 'G', 'A', 'D']);
  assert.equal(out.group, 3);
  assert.deepEqual(out.depths, [0, 0, 1, 0]);
  assert.deepEqual(out.dbl, [['renameDivider', 'D'], ['openSource', 'B']]);
});

// #1351: a selection window: a drag from the values column (or under the rows) selects the rows it crosses; Ctrl adds;
// a click without a drag selects the row under it (none under the rows); a drag on a name still moves the row
uiTest('#1351 SSim wave window: a selection window over the names and values selects several signals; Ctrl adds; a click one', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { st, cn, ptr, click, sel } = window.__inp;
    const r = {};
    ptr(cn, 'pointerdown', 250, 35);
    ptr(cn, 'pointermove', 250, 75);
    r.box = !!document.querySelector('.isim-selbox');
    ptr(cn, 'pointerup', 250, 75);
    r.three = sel(); r.gone = !document.querySelector('.isim-selbox');
    // from under the rows, up over D: D alone; with Ctrl: added to it
    ptr(cn, 'pointerdown', 250, 150); ptr(cn, 'pointermove', 250, 100); ptr(cn, 'pointerup', 250, 100);
    r.below = sel();
    ptr(cn, 'pointerdown', 250, 35, { ctrlKey: true }); ptr(cn, 'pointermove', 250, 45, { ctrlKey: true }); ptr(cn, 'pointerup', 250, 45, { ctrlKey: true });
    r.ctrl = sel();
    // a click in the values column: its row; under the rows: none
    click(cn, 250, 60); r.click = sel();
    click(cn, 250, 160); r.none = sel();
    // a drag on a name: the row moved (not a selection window)
    ptr(cn, 'pointerdown', 100, 40); ptr(cn, 'pointermove', 100, 75); r.noBox = !document.querySelector('.isim-selbox'); ptr(cn, 'pointerup', 100, 75);
    r.rows = st.rows.map((x) => x.name);
    return r;
  });
  assert.deepEqual(out, { box: true, three: ['1', '2', '3'], gone: true, below: ['4'], ctrl: ['1', '4'], click: ['2'], none: [], noBox: true, rows: ['B', 'A', 'G', 'D'] });
});

uiTest('#405 ISim wave window: the waves (the cursor snapped to a transition, Shift, a marker dragged), the menu and the keys', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { st, calls, cw, ptr, click, key, sel, menu } = window.__inp;
    const r = {};
    // a click at 1.03 ns on A: the cursor on its transition at 1 ns, A selected; with Shift, where it is
    click(cw, 503, 40); r.snap = [st.cursor, sel()];
    click(cw, 503, 40, { shiftKey: true }); r.shift = st.cursor;
    // the marker at 3 ns dragged on the ruler to 2.5 ns
    ptr(cw, 'pointerdown', 702, 10);
    ptr(cw, 'pointermove', 650, 10);
    ptr(cw, 'pointerup', 650, 10);
    r.marker = [st.markers[0].t, st.activeMarker === st.markers[0], st.cursor];
    // the menu on a row: the markers', the zooms', then the rows'
    cw.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 40 }));
    r.menu = menu().map((it) => (it.sep ? '-' : `${it.label}${it.disabled ? ' (disabled)' : ''}`));
    calls.splice(0);
    // the keys
    key('Delete'); key('ArrowRight'); key('ArrowLeft'); key('+'); key('-'); key('f'); key('m');
    r.keys = calls.splice(0);
    key('a', { ctrlKey: true }); r.all = sel();
    st.sel = new Set(['1']);
    key('ArrowDown'); r.down = sel();
    // editing the stimuli: a click on the rows goes to them first
    st.stim.on = true;
    click(cw, 503, 60);
    r.stim = calls.splice(0);
    return r;
  });
  assert.deepEqual(out.snap, [1000, ['1']]);
  assert.equal(out.shift, 1030);
  assert.deepEqual(out.marker, [2500, true, 1030]);
  assert.deepEqual(out.menu, ['Add Marker Here', 'Add Marker at Cursor', 'Delete Marker (disabled)', 'Delete All Markers', '-', 'Zoom In', 'Zoom Out',
    'Zoom to Full View', '-', 'Row Menu']);
  assert.deepEqual(out.keys, [['removeSelectedRows'], ['jumpEdge', 1], ['jumpEdge', -1], ['zoomAt', 0.5], ['zoomAt', 2], ['zoomFit'], ['addMarker', 1030]]);
  assert.deepEqual(out.all, ['1', '2', '3', '4']);
  assert.deepEqual(out.down, ['2']);
  assert.deepEqual(out.stim, [['stimClick', 103, 60]]);
});
