// UI: Cut / Copy / Paste / Delete of the Edit menu, the toolbar and the keyboard in every editor (#677): the text
// editor's selection, the ASM chart's, FSM diagram's and Petri net's, the schematic's (pasted offset, selected, with fresh names; into another schematic and
// into another project opened later), the items disabled when there is nothing to copy or paste; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, BROWSER } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';
import { newModel } from '../../core/asm.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const CTRL = 2;   // (CDP modifier bit)

const INV = `library ieee; use ieee.std_logic_1164.all;
entity inv is port (a : in std_logic; y : out std_logic); end inv;
architecture rtl of inv is begin y <= not a; end rtl;
`;
// a ── U1 ──(mid)── U2 ── y
function chain(name) {
  const doc = normalizeDoc({ ...newDoc(name, 'vhdl'),
    symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, name: 'U1' }, { id: 'S2', type: 'inv', x: 400, y: 100, name: 'U2' }],
    ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 120, y: 110 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 540, y: 110 }] });
  const pin = (id, n) => { const p = symbolPins(doc.symbols.find((s) => s.id === id)).find((q) => q.name === n); return { x: p.x, y: p.y }; };
  doc.wires.push({ id: 'W1', points: [{ x: 120, y: 110 }, pin('S1', 'I')] }, { id: 'W2', points: [pin('S1', 'O'), pin('S2', 'I')] }, { id: 'W3', points: [pin('S2', 'O'), { x: 540, y: 110 }] });
  doc.labels.push({ id: 'L1', x: 300, y: 110, net: 'mid' });
  return doc;
}
// a text Paste with nothing copied here: on where the system clipboard is read (Chromium), off in Firefox and WebKit (#888)
const sys = BROWSER === 'chrome' || BROWSER === 'chromium';
const editItems = async (page, menu = 'Edit') => {
  const items = await page.openMenu(menu);
  await page.closeMenus();
  return Object.fromEntries(items.filter((i) => i.label).map((i) => [i.label, !i.disabled]));
};
const tbEnabled = (page) => page.eval(async () => { (await import('/js/menus.js')).refreshSteps(); return Object.fromEntries(['cut', 'copy', 'paste'].map((c) => [c, !document.querySelector(`#toolbar .tb-btn[data-cmd=${c}]`).disabled])); });
const schDoc = (page) => page.eval(() => window.Silinx.active.schEditor.getDoc());
// whether sheet points are in the part of the schematic in view (its canvas)
const inView = (page, pts) => page.eval((ed, pts) => {
  const vp = document.querySelector(`${ed} .se-vp`), m = vp.getScreenCTM(), r = vp.ownerSVGElement.getBoundingClientRect();
  return pts.every(([x, y]) => { const sx = m.a * x + m.e, sy = m.d * y + m.f; return sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom; });
}, ED, pts);
const sorted = (a) => [...a].sort();

uiTest('Edit ▸ Cut / Copy / Paste / Delete and the toolbar: the text editor\'s selection', E, async (page) => {
  await makeProject(env, { name: 'ClipTxt', files: { 'src/inv.vhd': INV }, top: 'inv' });
  await page.openProject('ClipTxt');
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/inv.vhd' && window.Silinx.active.editor);
  const ed = (fn, ...a) => page.eval(fn, ...a);
  // nothing selected: Cut, Copy, Delete disabled; Paste enabled where the system clipboard is read (Chromium: it may hold
  // text), off in Firefox and WebKit until something is copied here (#888)
  await ed(() => { const e = window.Silinx.active.editor; e.focus(); e.setCursor({ line: 0, ch: 0 }); });
  let m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, false, sys, false]);
  assert.deepEqual(await tbEnabled(page), { cut: false, copy: false, paste: sys });
  // 'library' selected: Copy, then Paste at the end
  await ed(() => window.Silinx.active.editor.view.dispatch({ selection: { anchor: 0, head: 7 } }));
  m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [true, true, sys, true]);
  assert.deepEqual(await tbEnabled(page), { cut: true, copy: true, paste: sys });
  await page.menu('Edit', 'Copy');
  await ed(() => { const v = window.Silinx.active.editor.view; v.dispatch({ selection: { anchor: v.state.doc.length } }); });
  await page.menu('Edit', 'Paste');
  await page.waitFor(() => window.Silinx.active.editor.getValue().endsWith('rtl;\nlibrary'), [], { what: 'pasted at the end' });
  // the toolbar: Cut the first word, Paste it back
  await ed(() => window.Silinx.active.editor.view.dispatch({ selection: { anchor: 0, head: 8 } }));
  assert.deepEqual(await tbEnabled(page), { cut: true, copy: true, paste: true }, '(as a click or a key selecting does)');
  await page.click('#toolbar .tb-btn[data-cmd=cut]');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('ieee;'), [], { what: 'cut' });
  await page.click('#toolbar .tb-btn[data-cmd=paste]');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('library ieee;'), [], { what: 'pasted back' });
  // Delete: the selection gone, nothing copied
  await ed(() => { const v = window.Silinx.active.editor.view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.length - 7, head: t.length } }); });
  await page.menu('Edit', 'Delete');
  await page.waitFor(() => window.Silinx.active.editor.getValue() === `${'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is begin y <= not a; end rtl;\n'}`, [], { what: 'deleted' });
  // (the menu items' icons and shortcuts)
  const rows = await page.openMenu('Edit');
  await page.closeMenus();
  assert.ok(['Cut', 'Copy', 'Paste', 'Delete'].every((l) => rows.some((r) => r.label === l)));
  assert.deepEqual(await page.eval(() => { const it = window.Silinx.menus.find((x) => x.label === 'Edit').items().filter((i) => ['Cut', 'Copy', 'Paste', 'Delete'].includes(i.label)); return it.map((i) => i.shortcut); }), ['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Del']);
});

uiTest('Edit ▸ Cut / Copy / Paste in the schematic: in a blank place in view, selected, fresh names; the keyboard; another schematic; another project', E, async (page) => {
  await makeProject(env, { name: 'ClipSch', files: { 'src/a.sch.json': JSON.stringify(chain('a')), 'src/b.sch.json': JSON.stringify(newDoc('b', 'vhdl')) } });
  await makeProject(env, { name: 'ClipSch2', files: { 'src/c.sch.json': JSON.stringify(normalizeDoc({ ...newDoc('c', 'verilog'), symbols: [{ id: 'S1', type: 'inv', x: 600, y: 400, name: 'U1' }] })) } });
  await page.openProject('ClipSch');
  await page.eval(() => window.SilinxApp.openSch('src/a.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  // nothing selected, nothing copied: all four disabled
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  let m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, false, false, false]);
  assert.deepEqual(await tbEnabled(page), { cut: false, copy: false, paste: false });
  // Ctrl+A, Edit ▸ Copy, Edit ▸ Paste: a second chain, renamed, selected
  await page.key('a', { modifiers: CTRL });
  m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [true, true, false, true]);
  await page.menu('Edit', 'Copy');
  assert.equal((await editItems(page)).Paste, true, 'something to paste');
  await page.menu('Edit', 'Paste');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 4, [ED], { what: 'pasted' });
  let d = await schDoc(page);
  assert.deepEqual(sorted(d.symbols.map((s) => s.name)), ['U1', 'U2', 'inst_1', 'inst_2']);
  assert.deepEqual(sorted(d.ports.map((p) => p.name)), ['a', 'a_1', 'y', 'y_1']);
  assert.deepEqual(sorted(d.labels.map((l) => l.net)), ['mid', 'mid_1']);
  assert.equal(d.wires.length, 6);
  // (Edit ▸ Paste, the mouse on the menu: in a blank place of the sheet in view, clear of the chain, #1797)
  const copy = d.symbols.filter((s) => s.name.startsWith('inst')).map((s) => [s.x, s.y]);
  assert.equal(copy[1][0] - copy[0][0], 200, 'the copy as it was: U2 200 right of U1');
  assert.ok(copy[0][1] >= 160 || copy[0][1] <= 40, `clear of the chain (y 100): ${JSON.stringify(copy)}`);
  assert.deepEqual(await inView(page, copy), true, `in view: ${JSON.stringify(copy)}`);
  // the copy is the selection: Delete removes it
  await page.menu('Edit', 'Delete');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'the pasted copy deleted' });
  // the keyboard: Ctrl+V pastes the same again
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('v', { modifiers: CTRL });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 4, [ED], { what: 'pasted with Ctrl+V' });
  // Ctrl+X: the pasted copy (the selection) cut, then the toolbar's Paste
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('x', { modifiers: CTRL });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'cut with Ctrl+X' });
  await page.click('#toolbar .tb-btn[data-cmd=paste]');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 4, [ED], { what: 'pasted from the toolbar' });
  d = await schDoc(page);
  assert.deepEqual(sorted(d.symbols.map((s) => s.name)), ['U1', 'U2', 'inst_1', 'inst_2']);
  // another schematic of the project: in a blank place in view, nothing renamed
  await page.eval(() => window.SilinxApp.openSch('src/b.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/b.sch.json');
  await page.menu('Edit', 'Paste');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'pasted into b' });
  d = await schDoc(page);
  assert.deepEqual(sorted(d.symbols.map((s) => s.name)), ['inst_1', 'inst_2']);
  assert.deepEqual(sorted(d.labels.map((l) => l.net)), ['mid_1']);
  assert.deepEqual(sorted(d.ports.map((p) => p.name)), ['a_1', 'y_1']);
  // another project, opened later: the clipboard is still there
  await page.openProject('ClipSch2');
  await page.eval(() => window.SilinxApp.openSch('src/c.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'c drawn' });
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  assert.equal((await editItems(page)).Paste, true);
  await page.menu('Edit', 'Paste');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'pasted into the other project' });
  d = await schDoc(page);
  assert.deepEqual(sorted(d.symbols.map((s) => s.name)), ['U1', 'inst_1', 'inst_2']);
});

uiTest('Edit ▸ Cut / Copy / Paste / Delete in Portuguese: the menu and the toolbar\'s tooltips', E, async (page) => {
  await makeProject(env, { name: 'ClipPt', files: { 'src/inv.vhd': INV }, top: 'inv' });
  await page.openProject('ClipPt');
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => [...document.querySelectorAll('#menubar .item')].some((e) => e.textContent.trim() === 'Editar'), [], { what: 'the menus in Portuguese' });
    const items = Object.keys(await editItems(page, 'Editar'));
    for (const l of ['Cortar', 'Copiar', 'Colar', 'Apagar']) assert.ok(items.includes(l), `${l} in ${items.join(' | ')}`);
    assert.deepEqual(await page.eval(() => ['cut', 'copy', 'paste'].map((c) => document.querySelector(`#toolbar .tb-btn[data-cmd=${c}]`).title)), ['Cortar', 'Copiar', 'Colar']);
    // and it works
    await page.eval(() => { const e = window.Silinx.active.editor; e.focus(); e.view.dispatch({ selection: { anchor: 0, head: 8 } }); });
    await page.menu('Editar', 'Apagar');
    await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('ieee;'), [], { what: 'deleted' });
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

uiTest('Edit ▸ Cut / Copy / Paste / Delete in the ASM, FSM and Petri net editors: the menu, the toolbar, the keyboard, another drawing', E, async (page) => {
  await makeProject(env, { name: 'ClipDraw', files: {
    'src/ctl.asm.json': JSON.stringify(newModel('ctl', 'vhdl')), 'src/ctl2.asm.json': JSON.stringify({ ...newModel('ctl2', 'vhdl'), nodes: [], edges: [], initial: '' }),
    'src/det.fsm.json': JSON.stringify(newFsm('det', 'vhdl')), 'src/net.pn.json': JSON.stringify(newPetri('net', 'vhdl')) } });
  await page.openProject('ClipDraw');
  const D = '.doc:not([hidden])';
  const model = () => page.eval(() => { const d = window.Silinx.active; return (d.asmEditor || d.fsmEditor || d.petriEditor).getModel(); });
  const focus = (sel) => page.eval((x) => document.querySelector(x).focus(), sel);
  // the centre of an element once the view is fitted (an editor fits it on a frame after it is drawn): the same twice in
  // a row; a click before that missed the element, now and then (#894)
  const settled = async (sel) => {
    const at = () => page.eval((x) => { const r = document.querySelector(x).getBoundingClientRect(); return `${r.left + r.width / 2},${r.top + r.height / 2}`; }, sel);
    let p0 = null;
    for (let i = 0; i < 20; i++) { const p1 = await at(); if (p1 === p0) break; p0 = p1; await new Promise((r) => setTimeout(r, 100)); }
    const [x, y] = p0.split(',').map(Number);
    return { x, y };
  };
  // ASM: nothing selected → Cut / Copy / Delete off, nothing to paste; Ctrl+A, Edit ▸ Copy, Edit ▸ Paste
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  await page.waitFor((d) => window.Silinx.active?.id === 'asm:src/ctl.asm.json' && document.querySelector(`${d} [data-node]`), [D], { what: 'the ASM chart' });
  const n0 = (await model()).nodes.length;
  await focus(`${D} .asm-editor`);
  let m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, false, false, false]);
  await page.key('a', { modifiers: CTRL });
  m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [true, true, false, true]);
  await page.menu('Edit', 'Copy');
  await page.menu('Edit', 'Paste');
  await page.waitFor((n) => window.Silinx.active.asmEditor.getModel().nodes.length === 2 * n, [n0], { what: 'the chart pasted' });
  let a = await model();
  assert.ok(a.nodes.some((n) => n.name === 'IDLE_1'), 'renamed');
  // the copy is selected: Delete removes it
  await page.menu('Edit', 'Delete');
  await page.waitFor((n) => window.Silinx.active.asmEditor.getModel().nodes.length === n, [n0], { what: 'the copy deleted' });
  // another chart (empty): the toolbar's Paste, nothing renamed, its initial state the copy's
  await page.eval(() => window.SilinxApp.openAsm('src/ctl2.asm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl2.asm.json');
  await page.eval(async () => (await import('/js/menus.js')).refreshSteps());
  await page.click('#toolbar .tb-btn[data-cmd=paste]');
  await page.waitFor((n) => window.Silinx.active.asmEditor.getModel().nodes.length === n, [n0], { what: 'pasted into the other chart' });
  a = await model();
  assert.ok(a.nodes.some((n) => n.name === 'IDLE') && !a.nodes.some((n) => /_1$/.test(n.name || '')));
  assert.equal(a.nodes.find((n) => n.id === a.initial)?.name, 'IDLE');
  // FSM: a state selected (a click), Ctrl+C, Ctrl+V; a transition: Copy off, Delete on
  await page.eval(() => window.SilinxApp.openFsm('src/det.fsm.json'));
  await page.waitFor((d) => window.Silinx.active?.id === 'fsm:src/det.fsm.json' && document.querySelector(`${d} [data-state=s2] .fsm-circle`), [D], { what: 'the FSM' });
  await page.click(await settled(`${D} [data-state=s2] .fsm-circle`));
  await page.waitFor(() => window.Silinx.active.fsmEditor.canCopy(), [], { what: 'the state selected' });
  m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Delete], [true, true, true]);
  await focus(`${D} .fsm-editor`);
  await page.key('c', { modifiers: CTRL });
  await page.key('v', { modifiers: CTRL });
  await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states.length === 4, [], { what: 'the state pasted with Ctrl+V' });
  assert.deepEqual((await model()).states.map((s) => s.name), ['S0', 'S1', 'S2', 'S1_1']);
  // Ctrl+X: the pasted state (selected) cut
  await focus(`${D} .fsm-editor`);
  await page.key('x', { modifiers: CTRL });
  await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states.length === 3, [], { what: 'cut with Ctrl+X' });
  // Petri net: a place selected, Edit ▸ Cut, Edit ▸ Paste: it comes back (its arcs do not: they lead to the rest)
  await page.eval(() => window.SilinxApp.openPetri('src/net.pn.json'));
  await page.waitFor((d) => window.Silinx.active?.id === 'pn:src/net.pn.json' && document.querySelector(`${d} [data-id=p2] circle`), [D], { what: 'the Petri net' });
  await page.click(await settled(`${D} [data-id=p2] circle`));
  await page.waitFor((d) => document.querySelector(`${d} [data-id=p2]`)?.classList.contains('sel'), [D], { what: 'the place selected' });
  assert.equal((await editItems(page)).Cut, true);
  await page.menu('Edit', 'Cut');
  await page.waitFor(() => !window.Silinx.active.petriEditor.getModel().places.some((x) => x.name === 'work'), [], { what: 'cut' });
  await page.menu('Edit', 'Paste');
  await page.waitFor(() => window.Silinx.active.petriEditor.getModel().places.some((x) => x.name === 'work'), [], { what: 'pasted back' });
  const net = await model();
  assert.equal(net.places.length, 2);
  assert.equal(net.arcs.length, 2, 'the arcs of the place cut are gone');
  // a schematic's copy is not pasted into a drawing of another kind
  assert.equal((await editItems(page)).Paste, true, 'the Petri net has its own copy');
});

uiTest('Edit ▸ Copy / Paste / Delete with a text field of an editor in focus: its selected text, not the drawing (the truth table)', E, async (page) => {
  await makeProject(env, { name: 'ClipField', files: { 'src/maj.tt.json': JSON.stringify(newTable('maj', ['a', 'b', 'c'], ['f'])) } });
  await page.openProject('ClipField');
  await page.eval(() => window.SilinxApp.openTt('src/maj.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor .tt-expr-in'), [], { what: 'the truth table' });
  const F = '.doc:not([hidden]) .tt-expr-in';
  await page.eval((f) => { const el = document.querySelector(f); el.value = 'a·b + c'; el.focus(); el.setSelectionRange(0, 3); }, F);
  const m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [true, true, sys, true]);
  await page.menu('Edit', 'Copy');
  await page.eval((f) => { const el = document.querySelector(f); el.setSelectionRange(el.value.length, el.value.length); }, F);
  await page.eval(async () => (await import('/js/menus.js')).refreshSteps());
  await page.click('#toolbar .tb-btn[data-cmd=paste]');
  await page.waitFor((f) => document.querySelector(f).value === 'a·b + ca·b', [F], { what: 'pasted into the field' });
  assert.equal(await page.eval((f) => document.activeElement === document.querySelector(f), F), true, 'the focus kept in the field');
  await page.eval((f) => document.querySelector(f).setSelectionRange(0, 4), F);
  await page.menu('Edit', 'Delete');
  await page.waitFor((f) => document.querySelector(f).value === '+ ca·b', [F], { what: 'deleted in the field' });
});
