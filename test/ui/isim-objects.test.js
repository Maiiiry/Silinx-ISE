// UI: ISim's Objects panel (web/js/isim-objects.js, #405: out of mountISim), mounted alone in the page with a window
// of its own whose actions are recorded: the signals of the instance selected, their types and values at the cursor,
// the check box of the wave window, the selection (click, Ctrl, Shift), a double click, the drag and the menu.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// an instance u1 (VHDL) with the ports clk (in), d (in, 4 bits), q (out, 4 bits), an internal signal n and a memory
// (no wave); q is in the wave window and forced; its value is 3 before 10 ns and 12 after
const MOUNT = async () => {
  const { mountObjects } = await import('/js/isim-objects.js');
  const V = await import('/core/values.js');
  const host = document.createElement('div');
  host.innerHTML = '<div class="isim-obj-scope"></div><table class="isim-objs"><tbody></tbody></table>';
  document.body.append(host);
  const calls = [];
  const logic = (w) => ({ kind: 'logic', w, s: false, ...(w === 1 ? { scalar: true } : {}) });
  const inst = { name: 'u1', path: 'tb.u1', lang: 'vhdl' };
  const mk = (name, t, val) => ({ name, path: `tb.u1.${name}`, t, val, wave: [], inst });
  const clk = mk('clk', logic(1), V.fromInt(1, 1, false)), d = mk('d', logic(4), V.fromInt(5, 4, false));
  const q = mk('q', logic(4), null), n = mk('n', { kind: 'int', w: 32, s: true }, V.fromInt(-2, 32, true));
  const mem = { name: 'mem', path: 'tb.u1.mem', t: { kind: 'array', left: 0, right: 3 }, val: [], wave: null, inst };
  inst.ports = [{ name: 'clk', dir: 'in', sig: clk }, { name: 'd', dir: 'in', sig: d }, { name: 'q', dir: 'out', sig: q }];
  inst.signals = [clk, n, mem];
  const st = { curInst: inst, rows: [{ kind: 'sig', sig: q }], selObj: new Set(), cursor: 5000 };
  const sim = { valueAt: (s, t) => (s === q ? V.fromInt(t >= 10000 ? 12 : 3, 4, false) : s.val) };
  const rec = (name) => (...a) => { calls.push([name, ...a.map((x) => x?.name ?? (Array.isArray(x) ? x.map((y) => y.name) : x))]); };
  let menu = null;
  const objs = mountObjects({ st, sim, $: (s) => host.querySelector(s), objBody: host.querySelector('tbody'),
    instSignals: (i) => [...i.ports.map((p) => ({ sig: p.sig, port: p })), ...i.signals.filter((s) => !i.ports.some((p) => p.sig === s)).map((sig) => ({ sig, port: null }))],
    addSignals: rec('addSignals'), rebuildFlat: rec('rebuildFlat'), updateVScroll: () => {}, invalidate: () => {},
    showMenu: (x, y, items) => { menu = items; }, forceDialog: rec('forceDialog'), isForced: (s) => s === q, removeForces: rec('removeForces'),
    onOpenSource: () => {}, openSource: rec('openSource') });
  const rows = () => [...host.querySelectorAll('tbody tr')].map((tr) => [tr.querySelector('.c-name').textContent, tr.querySelector('.c-val').textContent,
    tr.querySelector('.c-type').textContent, tr.querySelector('input').checked, tr.classList.contains('sel')]);
  const tr = (i) => host.querySelectorAll('tbody tr')[i];
  const press = (i, o = {}) => tr(i).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...o }));
  const items = () => menu.map((it) => (it.sep ? '-' : `${it.label}${it.disabled ? ' (disabled)' : ''}`));
  window.__obj = { objs, st, calls, host, rows, tr, press, items, menu: () => menu, q };
  return true;
};

uiTest('#405 ISim Objects panel: the signals of the instance, their types and values at the cursor; the check box; the selection; a double click', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { objs, st, calls, host, rows, tr, press } = window.__obj;
    const r = {};
    objs.renderObjects();
    r.scope = host.querySelector('.isim-obj-scope').textContent;
    r.rows = rows();
    r.draggable = tr(0).draggable;
    // the values at the cursor, after it moved
    st.cursor = 20000;
    objs.updateObjectValues();
    r.q = rows()[2][1];
    // the selection: a click, Ctrl, Shift (from the first selected one)
    press(1);
    r.one = rows().map((x) => x[4]);
    press(3, { ctrlKey: true });
    r.ctrl = rows().map((x) => x[4]);
    press(0);
    press(2, { shiftKey: true });
    r.shift = rows().map((x) => x[4]);
    // a press on a check box does not select
    tr(4).querySelector('input').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    r.box = rows().map((x) => x[4]);
    // the check box: on adds to the waves, off removes and draws the panel again
    const box = (i) => tr(i).querySelector('input');
    box(1).checked = true; box(1).dispatchEvent(new Event('change'));
    box(2).checked = false; box(2).dispatchEvent(new Event('change'));
    r.rowsAfter = st.rows.length;
    r.checked = rows().map((x) => x[3]);
    // a double click adds a signal not in the waves yet
    tr(3).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    r.calls = calls.splice(0);
    // no instance: an empty panel
    st.curInst = null;
    objs.renderObjects();
    r.empty = [host.querySelector('.isim-obj-scope').textContent, rows().length];
    return r;
  });
  assert.equal(out.scope, '/tb/u1');
  assert.deepEqual(out.rows, [
    ['clk', '1', 'std_logic', false, false],
    ['d', '0101', 'std_logic_vector[3:0]', false, false],
    ['q', '0011', 'std_logic_vector[3:0]', true, false],
    ['n', '-2', 'integer', false, false],
    ['mem', '(array)', 'array [0 to 3]', false, false],
  ]);
  assert.equal(out.draggable, true);
  assert.equal(out.q, '1100');
  assert.deepEqual(out.one, [false, true, false, false, false]);
  assert.deepEqual(out.ctrl, [false, true, false, true, false]);
  assert.deepEqual(out.shift, [true, true, true, false, false]);
  assert.deepEqual(out.box, out.shift);
  assert.equal(out.rowsAfter, 0);
  assert.deepEqual(out.checked, [false, false, false, false, false]);
  assert.deepEqual(out.calls, [['addSignals', ['d']], ['rebuildFlat'], ['addSignals', ['n']]]);
  assert.deepEqual(out.empty, ['', 0]);
});

uiTest('#405 ISim Objects panel: the menu of one signal and of several (add, force, remove the force, the source, the path)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { objs, calls, rows, tr, items, menu } = window.__obj;
    const r = {};
    objs.renderObjects();
    // a right click on q, not selected: q alone selected, its menu
    tr(2).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    r.sel = rows().map((x) => x[4]);
    r.one = items();
    const run = (label) => menu().find((it) => it.label === label).action();
    run('Force Constant...'); run('Force Clock...'); run('Remove Force'); run('Go To Source Code'); run('Add to Wave Window');
    r.calls = calls.splice(0);
    // several selected (a right press keeps the selection): no force, no source, no path
    tr(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    tr(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: true }));
    tr(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    tr(1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    r.many = items();
    run('Add to Wave Window');
    r.manyCalls = calls.splice(0);
    // the memory (no wave): no force
    tr(4).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    tr(4).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    r.mem = items();
    return r;
  });
  assert.deepEqual(out.sel, [false, false, true, false, false]);
  assert.deepEqual(out.one, ['Add to Wave Window', '-', 'Force Constant...', 'Force Clock...', 'Remove Force', '-', 'Go To Source Code', 'Copy Path']);
  assert.deepEqual(out.calls, [['forceDialog', 'q', 'const'], ['forceDialog', 'q', 'clock'], ['removeForces', 'q', 0, ['q']], ['openSource', 'q'], ['addSignals', ['q']]]);
  assert.deepEqual(out.many, ['Add to Wave Window', '-', 'Force Constant... (disabled)', 'Force Clock... (disabled)', 'Remove Force (disabled)', '-',
    'Go To Source Code (disabled)', 'Copy Path (disabled)']);
  assert.deepEqual(out.manyCalls, [['addSignals', ['clk', 'd']]]);
  assert.deepEqual(out.mem, ['Add to Wave Window', '-', 'Force Constant... (disabled)', 'Force Clock... (disabled)', 'Remove Force (disabled)', '-',
    'Go To Source Code', 'Copy Path']);
});
