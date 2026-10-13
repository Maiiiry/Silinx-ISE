// UI: Truth Table / Karnaugh Map tool. A new table (Tools menu ▸ New Source wizard), cells clicked,
// the K-map groups and the minimal SOP shown, the student's own expression checked; Generate VHDL
// module (linked: a cell change rewrites the HDL, which simulates to the new table; a saved edit of
// the HDL updates the table; a sequential edit shows the out-of-sync banner); Generate Schematic
// (netlist without errors, simulates to the table); renaming the module keeps the link; Truth Table
// from Module; Apply of the input / output names, Generate Verilog module (then VHDL replaces it).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { truthTableFromModule } from '../../core/logic.js';
import { netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
/** The console lines after the project was opened, and the rows of the Errors and Warnings tabs. */
const consoleAfterOpen = async (page) => {
  const lines = (await page.consoleText()).split('\n');
  return lines.slice(lines.findIndex((l) => /^Project ".*" opened/.test(l)) + 1);
};
const problemRows = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent));

const ADDER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity add1 is port (a, b : in std_logic_vector(1 downto 0); s : out std_logic_vector(2 downto 0)); end add1;
architecture rtl of add1 is begin s <= std_logic_vector(resize(unsigned(a), 3) + resize(unsigned(b), 3)); end rtl;
`;
const simTable = (text, path, mod) => truthTableFromModule([{ path, text }], mod).table;
const ttFile = async (pj, p) => JSON.parse(await readWs(env, pj, p));

uiTest('Truth Table: new table, cells, K-map and SOP, my expression, linked VHDL module kept in sync both ways, schematic, rename', E, async (page) => {
  await makeProject(env, { name: 'TtPj', files: { 'src/add1.vhd': ADDER } });
  await page.openProject('TtPj');
  await page.menu('Tools', 'Truth Table / Karnaugh Map…');
  await page.waitDialog('New Source Wizard');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .src-types .st.sel').textContent), /^\s*Truth Table\s*$/);
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj3');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], T), ['a, b, c', 'f']);
  // majority: rows 3, 5, 6, 7
  for (const r of [3, 5, 6, 7]) await page.click(`${T} .tt-cell[data-out=f][data-row="${r}"]`);
  // a cell cycles 0 -> 1 -> X -> 0
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-cell[data-out=f][data-row="0"]`).textContent, T), 'X');
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T), '00010111');
  // K-map: three groups of two; minimal SOP and POS, canonical forms
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} svg.tt-kmap .tt-group`).length, T), 3);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), 'f = b·c + a·c + a·b');
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-cost`).textContent, T), /3 term\(s\), 6 literal\(s\); gates: 3 AND, 1 OR, 0 NOT/);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-pos .tt-expr`).textContent, T), /^f = \(.+\)·\(.+\)·\(.+\)$/);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-canon`).textContent, T), /f = Σm\(3, 5, 6, 7\)[\s\S]*f = ΠM\(0, 1, 2, 4\)/);
  // POS groups: the 0s
  await page.click(`${T} .tt-groups input[value=pos]`);
  // (a + c), the 0s of rows 0 and 2, wraps around the left and right edges: drawn as two parts
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-group`)].map((g) => g.dataset.term), T), ["0", "1", "1", "2"]);
  // check my answer: ab + bc misses row 5
  await page.fill(`${T} .tt-mine-in`, 'ab + bc');
  await page.waitFor((t) => /Different from the table in 1 row/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-table tr.tt-diff td.tt-idx`)].map((c) => c.textContent), T), ['5']);
  await page.fill(`${T} .tt-mine-in`, "ab + c(a+b)");
  await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  // the table is saved (autosave)
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).table.f, '00010111');

  // ---- Generate VHDL module: linked to the table
  await page.click(`${T} .tt-btn`, { text: 'Generate VHDL module' });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj3.vhd'] === 'src/maj3.tt.json', [], { what: 'linked HDL' });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).generatedFile, 'src/maj3.vhd');
  let vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.deepEqual(await consoleAfterOpen(page), [
    "Created Truth Table 'src/maj3.tt.json'.",
    "Truth table 'src/maj3.tt.json' -> VHDL module src/maj3.vhd (kept in sync with the table)",
  ]);
  assert.deepEqual(await problemRows(page), []);
  assert.equal(simTable(vhd, 'maj3.vhd', 'maj3').f, '00010111');
  // the hierarchy shows the module with its table, the HDL nested under it
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3/.test(r.textContent) && /maj3\.tt\.json/.test(r.textContent)), [], { what: 'maj3 (maj3.tt.json) in the hierarchy' });
  assert.ok(await page.eval(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3\.vhd/.test(r.textContent) && /synchronized HDL/.test(r.textContent))));
  // the HDL editor (opened) shows the banner
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && /Synchronized with maj3\.tt\.json/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'HDL editor banner' });

  // ---- table -> HDL: a cell change rewrites the module
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json');
  await page.waitFor((t) => /Synchronized with maj3\.vhd/.test(document.querySelector(`${t} .tt-link`).textContent), [T]);
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);       // f(0,0,0) = 1
  await page.waitFor(async () => /f = Σm\(0, 3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'HDL regenerated' });
  vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.equal(simTable(vhd, 'maj3.vhd', 'maj3').f, '10010111');
  // a don't care goes into the HDL comment
  await page.click(`${T} .tt-cell[data-out=f][data-row="1"]`);
  await page.click(`${T} .tt-cell[data-out=f][data-row="1"]`);       // row 1 = X
  await page.waitFor(async () => /don't care: f = d\(1\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'don\'t care in the HDL' });

  // ---- HDL -> table: a saved edit of the module updates the table (don't cares kept)
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}f <= .*;/, '    f <= a xor b xor c;')); });
  await page.waitFor(async () => (await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.tt.json')).json()).table.f === '0X101001', [], { what: 'table updated from the HDL', timeout: 15000 });
  // the open table shows it
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join('') === '0X101001', [T], { what: 'editor updated' });
  // a sequential module cannot be a truth table: out-of-sync banner with the reason
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd');
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}f <= .*;/, '    f <= a when rising_edge(b);')); });
  await page.waitFor(() => /Not in sync with maj3\.tt\.json — 'maj3' is sequential/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'out-of-sync banner', timeout: 15000 });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).table.f, '0X101001');
  // editing the table again rewrites the HDL: back in sync
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor((t) => /Not in sync with maj3\.vhd/.test(document.querySelector(`${t} .tt-link`).textContent), [T]);
  await page.click(`${T} .tt-cell[data-out=f][data-row="7"]`);       // 1 -> X
  await page.waitFor((t) => /Synchronized with maj3\.vhd/.test(document.querySelector(`${t} .tt-link`).textContent), [T], { what: 'back in sync', timeout: 15000 });
  // (the link says so as the HDL is written: the file on the disk a moment later)
  for (let k = 0; /rising_edge/.test(vhd = await readWs(env, 'TtPj', 'src/maj3.vhd')) && k < 100; k++) await new Promise((r) => setTimeout(r, 100));
  const sim = simTable(vhd, 'maj3.vhd', 'maj3').f;
  assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === sim[i]), sim);

  // ---- Generate Schematic: a gate schematic that simulates to the table
  await page.fill(`${T} .tt-nand`, true);
  await page.click(`${T} .tt-btn`, { text: 'Generate Schematic' });
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/maj3_sch.sch.json', [], { what: 'schematic opened', timeout: 15000 });
  const sch = JSON.parse(await readWs(env, 'TtPj', 'src/maj3_sch.sch.json'));
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual((await consoleAfterOpen(page)).slice(2), [
    "Truth table 'src/maj3.tt.json' -> schematic src/maj3_sch.sch.json (minimal POS, NAND gates only; not linked to the table: use Generate HDL in the schematic editor for its module 'maj3_sch').",
  ]);
  assert.deepEqual(await problemRows(page), []);
  assert.ok(sch.symbols.every((s) => s.type.startsWith('nand')), 'NAND gates only');
  const g = generateHdl(sch);
  const st = simTable(g.code, 'maj3_sch.vhd', 'maj3_sch').f;
  assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === st[i]), st);

  // ---- rename the module: the table follows (file, name, link)
  await page.treeRow('#hier', 'maj3', { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay input[type=text]', 'maj4', { index: 0 });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj4.vhd'] === 'src/maj4.tt.json', [], { what: 'link after the rename', timeout: 15000 });
  const t4 = await ttFile('TtPj', 'src/maj4.tt.json');
  assert.deepEqual([t4.name, t4.generatedFile], ['maj4', 'src/maj4.vhd']);
  assert.match(await readWs(env, 'TtPj', 'src/maj4.vhd'), /entity maj4 is/);
});

uiTest('Truth Table with many outputs (#176): 4 -> 16 outputs, cells of output 6, its K-map and SOP, the table scrolls, linked VHDL and schematic', E, async (page) => {
  const four = { version: 1, name: 'many', inputs: ['a', 'b', 'c'], outputs: ['y0', 'y1', 'y2', 'y3'], table: { y0: '00000001', y1: '01111111', y2: '01101001', y3: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  await makeProject(env, { name: 'TtMany', files: { 'src/many.tt.json': JSON.stringify(four, null, 2) } });
  await page.openProject('TtMany');
  await page.eval(() => window.SilinxApp.openTt('src/many.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/many.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  // no outputs: refused
  await page.fill(`${T} .tt-outputs`, ' ');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-toolbar .tt-err`).textContent, T), 'At least 1 output');
  // 16 outputs: the 4 columns kept, 12 new ones at 0
  const outs = Array.from({ length: 16 }, (_, i) => `y${i}`);
  await page.fill(`${T} .tt-outputs`, outs.join(', '));
  await page.waitFor((t) => document.querySelectorAll(`${t} .tt-table th.tt-out`).length === 16, [T], { what: '16 output columns' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-toolbar .tt-err`).textContent, T), '');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-tab`)].map((b) => b.dataset.out), T), outs);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=y3]`)].map((c) => c.textContent).join(''), T), '00010111');
  // output 6 (y5): rows 0 and 6 at 1, row 1 a don't care
  for (const r of [0, 6, 1, 1]) await page.click(`${T} .tt-cell[data-out=y5][data-row="${r}"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=y5]`)].map((c) => c.textContent).join(''), T), '1X000010');
  // its K-map, canonical forms and minimal SOP
  await page.click(`${T} .tt-tab[data-out=y5]`);
  assert.ok(await page.eval((t) => document.querySelector(`${t} .tt-tab.active`).dataset.out === 'y5' && document.querySelector(`${t} .tt-table th.tt-out.sel`).textContent === 'y5', T));
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-kcell`)].map((g) => `${g.dataset.row}:${g.querySelector('.tt-k-v').textContent}`), T),
    ['0:1', '1:X', '3:0', '2:0', '4:0', '5:0', '7:0', '6:1']);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-canon`).textContent, T), /y5 = Σm\(0, 6\) \+ d\(1\)/);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "y5 = a'·b' + a·b·c'");
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} svg.tt-kmap .tt-group`).length, T), 2);
  // a K-map cell of output 6: row 7 -> 1
  await page.click(`${T} svg.tt-kmap .tt-kcell[data-row="7"] rect`);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "y5 = a'·b' + a·b");
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-cell[data-out=y5][data-row="7"]`).textContent, T), '1');
  // the layout: the table scrolls sideways in its panel, the K-map panel keeps its room, the tabs wrap
  const lay = await page.eval((t) => {
    const left = document.querySelector(`${t} .tt-left`), right = document.querySelector(`${t} .tt-right`), tabs = document.querySelector(`${t} .tt-tabs`), tab = tabs.querySelector('.tt-tab');
    return { scrolls: left.scrollWidth > left.clientWidth, left: left.getBoundingClientRect().width, editor: document.querySelector(t).getBoundingClientRect().width, right: right.getBoundingClientRect().width, kmapIn: right.querySelector('svg.tt-kmap').getBoundingClientRect().right <= right.getBoundingClientRect().right + 1, tabsFit: tabs.scrollWidth <= tabs.clientWidth + 1, tabRows: Math.round(tabs.getBoundingClientRect().height / tab.getBoundingClientRect().height) };
  }, T);
  assert.ok(lay.scrolls, `the table scrolls: ${JSON.stringify(lay)}`);
  assert.ok(lay.left <= lay.editor * 0.48 + 1 && lay.right >= lay.editor * 0.5 - 30, `the panels: ${JSON.stringify(lay)}`);
  assert.ok(lay.kmapIn && lay.tabsFit, `the K-map and the tabs fit: ${JSON.stringify(lay)}`);
  // the last column reached by scrolling, clickable
  await page.eval((t) => { const l = document.querySelector(`${t} .tt-left`); l.scrollLeft = l.scrollWidth; }, T);
  await page.click(`${T} .tt-cell[data-out=y15][data-row="2"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=y15]`)].map((c) => c.textContent).join(''), T), '00100000');
  // saved: 16 outputs
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.tt.json')).json()).table?.y15 === '00100000', [], { what: 'saved' });
  const saved = await ttFile('TtMany', 'src/many.tt.json');
  assert.deepEqual(saved.outputs, outs);
  assert.deepEqual([saved.table.y3, saved.table.y5, saved.table.y15, saved.table.y9], ['00010111', '1X000011', '00100000', '00000000']);

  // ---- linked VHDL module: 16 outputs, simulates to the table; an HDL edit of output 6 comes back
  await page.click(`${T} .tt-btn`, { text: 'Generate VHDL module' });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/many.vhd'] === 'src/many.tt.json', [], { what: 'linked HDL' });
  const vhd = await readWs(env, 'TtMany', 'src/many.vhd');
  assert.deepEqual(await consoleAfterOpen(page), ["Truth table 'src/many.tt.json' -> VHDL module src/many.vhd (kept in sync with the table)"]);
  assert.deepEqual(await problemRows(page), []);
  assert.match(vhd, /y0, y1, y2, y3, y4, y5, y6, y7, y8, y9, y10, y11, y12, y13, y14, y15 : out std_logic/);
  const st = simTable(vhd, 'many.vhd', 'many');
  assert.deepEqual(Object.keys(st), outs);
  assert.deepEqual([st.y3, st.y5, st.y15, st.y9], ['00010111', '11000011', '00100000', '00000000']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/many.vhd' && window.Silinx.active.editor, [], { what: 'HDL editor' });
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}y5 <= .*;/, '    y5 <= a xor c;')); });
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.tt.json')).json()).table.y5 === '0X011010', [], { what: 'table updated from the HDL', timeout: 15000 });
  assert.deepEqual((await ttFile('TtMany', 'src/many.tt.json')).outputs, outs);

  // ---- Generate Schematic: 16 output markers, simulates to the table
  await page.eval(() => window.SilinxApp.openTt('src/many.tt.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/many.tt.json' && [...document.querySelectorAll(`${t} .tt-cell[data-out=y5]`)].map((c) => c.textContent).join('') === '0X011010', [T], { what: 'editor updated' });
  await page.click(`${T} .tt-btn`, { text: 'Generate Schematic' });
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/many_sch.sch.json', [], { what: 'schematic opened', timeout: 15000 });
  const sch = JSON.parse(await readWs(env, 'TtMany', 'src/many_sch.sch.json'));
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(await consoleAfterOpen(page), [
    "Truth table 'src/many.tt.json' -> VHDL module src/many.vhd (kept in sync with the table)",
    "Truth table 'src/many.tt.json' -> schematic src/many_sch.sch.json (minimal SOP; not linked to the table: use Generate HDL in the schematic editor for its module 'many_sch').",
  ]);
  assert.deepEqual(await problemRows(page), []);
  assert.deepEqual(sch.ports.filter((p) => p.dir === 'out').map((p) => p.name), outs);
  const ss = simTable(generateHdl(sch).code, 'many_sch.vhd', 'many_sch');
  assert.deepEqual([ss.y3, ss.y15, ss.y9], ['00010111', '00100000', '00000000']);
  assert.ok([...'0X011010'].every((c, i) => c === 'X' || c === ss.y5[i]), ss.y5);
});

uiTest("Truth Table expressions (#180): '/' NOT and '.' AND typed in the Expression field fill the XOR's column; the operators shown", E, async (page) => {
  await makeProject(env, { name: 'TtOps', files: { 'src/ops.tt.json': JSON.stringify({ version: 1, name: 'ops', inputs: ['a', 'b', 'c'], outputs: ['f'], table: { f: '00000000' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }, null, 2) } });
  await page.openProject('TtOps');
  await page.eval(() => window.SilinxApp.openTt('src/ops.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/ops.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ops`).textContent, T), "Operators: ' / ~ (NOT), · . * (AND), ^ or xor (XOR), + (OR)");
  await page.fill(`${T} .tt-expr-in`, '/a.b + a./b');
  await page.click(`${T} .tt-btn`, { text: 'Fill Table' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), '');
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T), '00111100');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "f = a'·b + a·b'");
  // my answer with the same notation, and as an XOR
  await page.fill(`${T} .tt-mine-in`, 'a ^ b');
  await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  await page.fill(`${T} .tt-mine-in`, '/ab + a/b');      // '/' negates only the next letter
  await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  await page.fill(`${T} .tt-mine-in`, '/a./b');
  await page.waitFor((t) => /Different from the table in 6 row/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  // an invalid expression: where it stops
  await page.fill(`${T} .tt-expr-in`, 'a..b');
  await page.click(`${T} .tt-btn`, { text: 'Fill Table' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), "expected a variable, 0, 1 or ( but found '.' (at position 3)");
  await page.waitFor(async () => (await (await fetch('/api/projects/TtOps/file?path=src%2Fops.tt.json')).json()).exprs?.f === '/a.b + a./b', [], { what: 'saved' });
});

uiTest('Truth Table from Module: a vector adder read into a table (exhaustive simulation); module context menu makes a new table', E, async (page) => {
  await makeProject(env, { name: 'TtMod', files: { 'src/add1.vhd': ADDER } });
  await page.openProject('TtMod');
  // module context menu: a new (unlinked) table
  await page.treeRow('#hier', 'add1', { right: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Truth Table / Karnaugh Map of this Module…' });
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/add1_tt.tt.json', [], { what: 'table of add1', timeout: 15000 });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], T), ['a_1, a_0, b_1, b_0', 's_2, s_1, s_0']);
  const t = await ttFile('TtMod', 'src/add1_tt.tt.json');
  for (let r = 0; r < 16; r++) assert.equal(t.table.s_2[r] + t.table.s_1[r] + t.table.s_0[r], ((r >> 2) + (r & 3)).toString(2).padStart(3, '0'));
  assert.equal(t.generatedFile, undefined);
  // 4 inputs: a 4x4 map; s_0 = a_0 xor b_0 (two groups)
  await page.click(`${T} .tt-tab[data-out=s_0]`);
  assert.equal(await page.eval((x) => document.querySelectorAll(`${x} svg.tt-kmap .tt-kcell`).length, T), 16);
  assert.equal(await page.eval((x) => document.querySelector(`${x} .tt-sop .tt-expr`).textContent, T), "s_0 = a_0'·b_0 + a_0·b_0'");
  // the editor's "Truth Table from Module…" on a new table
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => /Truth Table/.test(e.textContent)); r.scrollIntoView(); r.click(); });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'blank');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/blank.tt.json');
  await page.click(`${T} .tt-btn`, { text: 'Truth Table from Module…' });
  await page.waitDialog('Truth Table from Module');
  await page.dialogButton('OK');
  await page.waitDialog('Truth Table from Module');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitFor((x) => document.querySelector(`${x} .tt-outputs`).value === 's_2, s_1, s_0', [T]);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMod/file?path=src%2Fblank.tt.json')).json()).outputs?.length === 3, [], { what: 'saved' });
});

uiTest('Truth Table (#196): Apply input / output names (columns follow their names, the errors shown), Generate Verilog module (compiles to the table), then VHDL replaces it', E, async (page) => {
  await makeProject(env, { name: 'TtVlog' });
  await page.openProject('TtVlog');
  await page.menu('Tools', 'Truth Table / Karnaugh Map…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tv');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  const cells = (o) => page.eval((t, x) => [...document.querySelectorAll(`${t} .tt-cell[data-out=${x}]`)].map((c) => c.textContent).join(''), T, o);
  // the names typed, then the Apply button (no change event)
  const apply = async (ins, outs) => {
    await page.eval((t, a, b) => { document.querySelector(`${t} .tt-inputs`).value = a; document.querySelector(`${t} .tt-outputs`).value = b; }, T, ins, outs);
    await page.click(`${T} .tt-btn`, { text: 'Apply' });
    return page.eval((t) => document.querySelector(`${t} .tt-err`).textContent, T);
  };
  // f = a (rows 4..7)
  for (const r of [4, 5, 6, 7]) await page.click(`${T} .tt-cell[data-out=f][data-row="${r}"]`);
  assert.equal(await cells('f'), '00001111');
  // errors: nothing changes
  assert.equal(await apply('a b c d e f g', 'f'), '1 to 6 inputs');
  assert.equal(await apply('a, b, c', ''), 'At least 1 output');
  assert.equal(await apply('a, b, a', 'f'), "the name 'a' is used twice");
  assert.equal(await apply('a, b, c', 'end'), "'end' is not a valid name (a letter, then letters, digits and single _; not a VHDL/Verilog keyword)");
  assert.equal(await apply('a, b, c', 'a'), "the name 'a' is used twice");
  assert.equal(await cells('f'), '00001111');
  // inputs reordered: f follows a, now the least significant bit; a new output g of 0s; separators , ; and spaces
  assert.equal(await apply('c b;a', 'f, g'), '');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-tab`)].map((e) => e.dataset.out), T), ['f', 'g']);
  assert.equal(await cells('f'), '01010101');
  assert.equal(await cells('g'), '00000000');
  // g = c·b (rows 6, 7)
  await page.click(`${T} .tt-tab[data-out=g]`);
  for (const r of [6, 7]) await page.click(`${T} .tt-cell[data-out=g][data-row="${r}"]`);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.tt.json')).json()).table.g === '00000011', [], { what: 'saved' });
  const t0 = await ttFile('TtVlog', 'src/tv.tt.json');
  assert.deepEqual([t0.inputs, t0.outputs, t0.table], [['c', 'b', 'a'], ['f', 'g'], { f: '01010101', g: '00000011' }]);
  // Generate Verilog module: src/tv.v, linked, simulates to the table
  await page.click(`${T} .tt-btn`, { text: 'Generate Verilog module' });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/tv.v'] === 'src/tv.tt.json', [], { what: 'linked Verilog', timeout: 15000 });
  await page.waitConsole(/Truth table 'src\/tv\.tt\.json' -> VERILOG module src\/tv\.v \(kept in sync with the table\)/);
  assert.deepEqual(page.dialogs, []);
  const v = await readWs(env, 'TtVlog', 'src/tv.v');
  assert.match(v, /module tv\s*\(/);
  assert.deepEqual(simTable(v, 'tv.v', 'tv'), { f: '01010101', g: '00000011' });
  const t1 = await ttFile('TtVlog', 'src/tv.tt.json');
  assert.deepEqual([t1.generatedFile, t1.lang], ['src/tv.v', 'verilog']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/tv.v' && /Synchronized with tv\.tt\.json/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'Verilog editor banner' });
  // a cell change rewrites the Verilog
  await page.eval(() => window.SilinxApp.openTt('src/tv.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.tt.json');
  await page.click(`${T} .tt-tab[data-out=g]`);
  await page.click(`${T} .tt-cell[data-out=g][data-row="0"]`);
  await page.waitFor(async () => /g = Σm\(0, 6, 7\)/.test(await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.v')).text()), [], { what: 'Verilog regenerated' });
  assert.deepEqual(simTable(await readWs(env, 'TtVlog', 'src/tv.v'), 'tv.v', 'tv'), { f: '01010101', g: '10000011' });
  // Generate VHDL module: asks to replace the Verilog file; Yes: src/tv.vhd, the .v removed
  await page.click(`${T} .tt-btn`, { text: 'Generate VHDL module' });
  await page.waitDialog('Generate HDL');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').textContent), /src\/tv\.v is generated from this truth table\. Replace it with src\/tv\.vhd\?/);
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/tv.vhd'] === 'src/tv.tt.json' && !window.Silinx.fileTree.includes('src/tv.v'), [], { what: 'VHDL replaces Verilog', timeout: 15000 });
  assert.deepEqual(simTable(await readWs(env, 'TtVlog', 'src/tv.vhd'), 'tv.vhd', 'tv'), { f: '01010101', g: '10000011' });
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
