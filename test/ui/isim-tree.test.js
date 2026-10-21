// UI: ISim's instance tree (web/js/isim-tree.js, #405: out of mountISim), mounted alone in the page with a window of
// its own whose actions are recorded: the instances and their processes, the selected one, its twisty, its menu, the
// instance added to the wave window (recursive: a divider before each instance), a double click, the drag.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// top (a, b) with u1 (x; a process p1 at line 3) and u2 (no signal); top's glue process is not shown
const MOUNT = async () => {
  const { mountTree } = await import('/js/isim-tree.js');
  const treeEl = document.createElement('ul');
  document.body.append(treeEl);
  const sig = (path) => ({ name: path.split('.').pop(), path });
  const u1 = { name: 'u1', path: 'top.u1', module: 'sub', file: 'sub.v', children: [], procs: [{ name: 'p1', kind: 'always', loc: { line: 3 } }],
    ports: [{ sig: sig('top.u1.x') }], signals: [] };
  const u2 = { name: 'u2', path: 'top.u2', module: 'sub2', children: [], procs: [], ports: [], signals: [] };
  const top = { name: 'top', path: 'top', module: 'top', children: [u1, u2], procs: [{ name: 'g', kind: 'glue' }], ports: [{ sig: sig('top.a') }],
    signals: [sig('top.b')] };
  const st = { curInst: top, rows: [], rowSeq: 1 };
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a.map((x) => x?.name ?? x)]); };
  let menu = null;
  const tree = mountTree({ st, design: { top }, treeEl, onOpenSource: () => {}, openSource: rec('openSource'),
    showMenu: (x, y, items) => { menu = items; }, renderObjects: rec('renderObjects'),
    instSignals: (i) => [...i.ports.map((p) => ({ sig: p.sig })), ...i.signals.map((s) => ({ sig: s }))],
    newRow: (s) => ({ id: st.rowSeq++, kind: 'sig', sig: s, name: s.name }), rebuildFlat: rec('rebuildFlat'), updateVScroll: () => {}, invalidate: () => {} });
  const rows = () => [...treeEl.querySelectorAll('.row')].map((r) => `${r.querySelector('.twisty').textContent}${r.querySelector('.lbl').textContent}`
    + `${r.querySelector('.isim-mod') ? ' ' + r.querySelector('.isim-mod').textContent : ''}${r.classList.contains('sel') ? ' *' : ''}`);
  const row = (label) => [...treeEl.querySelectorAll('.row')].find((r) => r.querySelector('.lbl').textContent === label);
  window.__tree = { tree, st, calls, rows, row, menu: () => menu, u1, top };
  return true;
};

uiTest('#405 ISim instance tree: instances and processes, the selection, the twisty, a double click, the drag', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { tree, st, calls, rows, row, u1 } = window.__tree;
    const r = {};
    tree.renderTree();
    r.rows = rows();
    r.titles = [row('top').title, row('p1').title, row('top').draggable];
    // u1 selected: the Objects panel drawn again
    row('u1').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    r.sel = [st.curInst === u1, rows()];
    // top's twisty: closed, then open
    row('top').querySelector('.twisty').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    r.closed = rows();
    row('top').querySelector('.twisty').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // a process selects its instance
    row('p1').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    row('u2').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    row('p1').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    r.calls = calls.splice(0);
    // the drag: the instance's path
    const dt = new DataTransfer();
    row('u1').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    r.drag = dt.getData('text/x-isim');
    return r;
  });
  assert.deepEqual(out.rows, ['▾top (top) *', '▾u1 (sub)', 'p1', 'u2 (sub2)']);
  assert.deepEqual(out.titles, ['/top', 'always (line 3)', true]);
  assert.deepEqual(out.sel, [true, ['▾top (top)', '▾u1 (sub) *', 'p1', 'u2 (sub2)']]);
  assert.deepEqual(out.closed, ['▸top (top)']);
  assert.deepEqual(out.calls, [['renderObjects'], ['renderObjects'], ['openSource', 'u2'], ['openSource', 'p1']]);
  assert.equal(out.drag, '{"inst":"top.u1"}');
});

uiTest('#405 ISim instance tree: the menu, an instance added to the wave window (alone, recursive, at a row)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { tree, st, calls, row, menu, top } = window.__tree;
    const r = {};
    tree.renderTree();
    row('top').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    r.menu = menu().map((it) => (it.sep ? '-' : `${it.label}${it.disabled ? ' (disabled)' : ''}`));
    menu()[0].action();
    r.alone = st.rows.map((x) => x.name);
    st.rows = [];
    menu()[1].action();
    r.recursive = st.rows.map((x) => `${x.kind}:${x.name}`);
    tree.addInstance(top.children[0], false, 1);
    r.at = st.rows.map((x) => x.name);
    r.calls = calls.splice(0);
    return r;
  });
  assert.deepEqual(out.menu, ['Add to Wave Window', 'Add to Wave Window (Recursive)', '-', 'Go To Source Code']);
  assert.deepEqual(out.alone, ['a', 'b']);
  assert.deepEqual(out.recursive, ['div:/top', 'sig:a', 'sig:b', 'div:/top/u1', 'sig:x', 'div:/top/u2']);
  assert.deepEqual(out.at, ['/top', 'x', 'a', 'b', '/top/u1', 'x', '/top/u2']);
  assert.deepEqual(out.calls, [['renderObjects'], ['rebuildFlat'], ['renderObjects'], ['rebuildFlat'], ['renderObjects'], ['rebuildFlat'], ['renderObjects']]);
});
