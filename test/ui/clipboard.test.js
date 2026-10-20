// UI: Cut / Copy / Paste / Delete of the Edit menu, the toolbar and the keyboard in every editor (#677): the text
// editor's selection, the schematic's (pasted offset, selected, with fresh names; into another schematic and
// into another project opened later), the items disabled when there is nothing to copy or paste; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

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
const editItems = async (page, menu = 'Edit') => {
  const items = await page.openMenu(menu);
  await page.closeMenus();
  return Object.fromEntries(items.filter((i) => i.label).map((i) => [i.label, !i.disabled]));
};
const tbEnabled = (page) => page.eval(async () => { (await import('/js/menus.js')).refreshSteps(); return Object.fromEntries(['cut', 'copy', 'paste'].map((c) => [c, !document.querySelector(`#toolbar .tb-btn[data-cmd=${c}]`).disabled])); });
const schDoc = (page) => page.eval(() => window.Silinx.active.schEditor.getDoc());
const sorted = (a) => [...a].sort();

uiTest('Edit ▸ Cut / Copy / Paste / Delete and the toolbar: the text editor\'s selection', E, async (page) => {
  await makeProject(env, { name: 'ClipTxt', files: { 'src/inv.vhd': INV }, top: 'inv' });
  await page.openProject('ClipTxt');
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/inv.vhd' && window.Silinx.active.editor);
  const ed = (fn, ...a) => page.eval(fn, ...a);
  // nothing selected: Cut, Copy, Delete disabled; Paste enabled (the system clipboard may hold text)
  await ed(() => { const e = window.Silinx.active.editor; e.focus(); e.setCursor({ line: 0, ch: 0 }); });
  let m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, false, true, false]);
  assert.deepEqual(await tbEnabled(page), { cut: false, copy: false, paste: true });
  // 'library' selected: Copy, then Paste at the end
  await ed(() => window.Silinx.active.editor.view.dispatch({ selection: { anchor: 0, head: 7 } }));
  m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [true, true, true, true]);
  assert.deepEqual(await tbEnabled(page), { cut: true, copy: true, paste: true });
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

uiTest('Edit ▸ Cut / Copy / Paste in the schematic: offset, selected, fresh names; the keyboard; another schematic; another project', E, async (page) => {
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
  assert.deepEqual(d.symbols.filter((s) => s.name.startsWith('inst')).map((s) => [s.x, s.y]), [[240, 140], [440, 140]], 'offset by 40, 40');
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
  // another schematic of the project: pasted where it was, nothing renamed
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
