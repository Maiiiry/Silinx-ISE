// UI: schematic editor (place symbols, wire them, I/O markers, save, Generate HDL), ASM chart
// editor (states, decision, case box, connections, Generate HDL; # Snap, </> Code and Copy, Reset
// route / Delete connection, Swap 1 / 0 exits, a case exit's ✕, Delete box, Zoom / Fit, ↶ ↷ and
// Edit ▸ Undo / Redo: #195), print preview of a diagram; the schematic editor's Rotate (Ctrl+R,
// toolbar, properties), zoom buttons, palette Place Symbol.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, waitDownload, chromeOnly } from './harness.js';
import { compile, elaborate } from '../../core/compile.js';
import { normalizeModel, generate } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const PROBLEMS_ASM_NO_E7 = ["error: State 'DONE' has no exit (next state path)"], PROBLEMS_ASM_NO_E5 = ["warning: State 'DONE' is unreachable from the initial state"];

// New Source wizard: a type of the list, a file name, then Next until Finish
async function newSource(page, type, name) {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.click('.dlg-overlay .src-types .st', { text: type });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  for (let i = 0; i < 4; i++) {
    const last = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].some((b) => b.textContent === 'Finish'));
    if (last) break;
    await page.dialogButton('Next >');
  }
  await page.dialogButton('Finish');
  await page.waitNoDialog();
}

// screen position of a pin of a schematic symbol (sheet coordinates through the view transform)
const SCH_PIN = `window.__schPin = async (symIndex, dir) => {
  const sd = await import('/core/schdoc.js');
  const doc = window.Silinx.active.schEditor.getDoc();
  const s = doc.symbols[symIndex];
  const p = sd.symbolPins(s, {}).find((q) => q.dir === dir);
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\\(([-\\d.]+),([-\\d.]+)\\) scale\\(([\\d.]+)\\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + p.x * +m[3], y: r.top + +m[2] + p.y * +m[3] };
};`;

uiTest('schematic editor: place two inverters, wire them, add I/O markers, save, Generate HDL', E, async (page) => {
  await makeProject(env, { name: 'SchPj' });
  await page.openProject('SchPj');
  await newSource(page, 'Schematic (Diagram)', 'chain');
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/chain.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'));
  await page.eval(SCH_PIN);
  // the palette: search, then click the symbol and click twice on the sheet
  await page.fill('.doc:not([hidden]) .se-search', 'inv');
  await page.click('.doc:not([hidden]) .se-symrow', { text: 'INV' });
  const c = await page.eval(() => { const r = document.querySelector('.doc:not([hidden]) .se-svg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.click({ x: c.x - 120, y: c.y });
  await page.click({ x: c.x + 120, y: c.y });
  await page.key('Escape');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 2);
  assert.deepEqual(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.map((s) => s.type)), ['inv', 'inv']);
  // wire: output of the first to the input of the second
  await page.click('.doc:not([hidden]) .se-btn[data-act=wire]');
  await page.click(await page.eval(() => window.__schPin(0, 'out')));
  await page.click(await page.eval(() => window.__schPin(1, 'in')));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1);
  // I/O markers on the free pins (name asked in place)
  await page.click('.doc:not([hidden]) .se-btn[data-act=io]');
  for (const [i, dir, name] of [[0, 'in', 'din'], [1, 'out', 'dout']]) {
    await page.click(await page.eval((k, d) => window.__schPin(k, d), i, dir));
    await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
    await page.type(name);
    await page.key('Enter');
    await page.waitFor((n) => window.Silinx.active.schEditor.getDoc().ports.some((p) => p.name === n), [name]);
  }
  await page.key('Escape');
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}`).sort(), ['din:in', 'dout:out']);
  // the editor's Check has no errors
  await page.click('.doc:not([hidden]) .se-btn[data-act=check]');
  // saved automatically (the .sch.json on disk)
  await page.waitFor(async () => { const d = JSON.parse(await (await fetch('/api/projects/SchPj/file?path=src/chain.sch.json')).text()); return d.symbols.length === 2 && d.ports.length === 2; }, [], { what: 'schematic saved' });
  const saved = JSON.parse(await readWs(env, 'SchPj', 'src/chain.sch.json'));
  assert.equal(saved.symbols.length, 2);
  assert.equal(saved.wires.length, 1);
  assert.equal(saved.ports.length, 2);
  // Generate HDL: src/chain.vhd, linked to the schematic, compiles to two inverters in series
  await page.click('.doc:not([hidden]) .se-btn[data-act=generate]');
  await page.waitConsole(/Schematic 'src\/chain\.sch\.json' -> generated VHDL file src\/chain\.vhd/);
  assert.deepEqual(page.dialogs, [], 'no "generate anyway?" question: the schematic has no errors');
  const vhd = await readWs(env, 'SchPj', 'src/chain.vhd');
  assert.match(vhd, /entity chain is/i);
  const lib = compile([{ path: 'src/chain.vhd', lang: 'vhdl', text: vhd }]);
  const d = elaborate(lib, 'chain');
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  assert.deepEqual(d.top.ports.map((p) => `${p.name}:${p.dir}`).sort(), ['din:in', 'dout:out']);
  // in the hierarchy the schematic is the module, its views as badges: its synchronized HDL, the schematic the base (#207)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl').textContent === 'chain' && /chain\.sch\.json/.test(r.querySelector('.meta')?.textContent)));
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.lbl').textContent === 'chain').map((r) => [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`))), [['HDL', 'Schematic*']]);
  // (the HDL file there from the start: every source has its HDL)
  assert.match(await page.consoleText(), /src\/chain\.vhd generated from src\/chain\.sch\.json \(every source has its HDL\)/);
  // View HDL shows the code; Close
  await page.click('.doc:not([hidden]) .se-btn[data-act=view]');
  await page.waitFor(() => /entity chain is/i.test(document.querySelector('.doc:not([hidden]) .se-code')?.textContent || ''));
  await page.click('.doc:not([hidden]) .se-dialog .btn', { text: 'Close' });
});

uiTest('schematic editor (#196): Rotate by Ctrl+R, the toolbar and the properties (rot saved in the .sch.json), Zoom In / Out / Full View buttons, the palette context menu Place Symbol', E, async (page) => {
  const { newDoc } = await import('../../core/schdoc.js');
  const doc = newDoc('rot', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: {} });
  await makeProject(env, { name: 'SchRot', files: { 'src/rot.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('SchRot');
  await page.eval(() => window.SilinxApp.openSch('src/rot.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/rot.sch.json' && document.querySelector('.doc:not([hidden]) .se-symrow'), [], { what: 'schematic editor' });
  const D = '.doc:not([hidden])';
  const saved = async () => JSON.parse(await readWs(env, 'SchRot', 'src/rot.sch.json'));
  const waitRot = (rots) => page.waitFor(async (r) => JSON.stringify(JSON.parse(await (await fetch('/api/projects/SchRot/file?path=src%2Frot.sch.json')).text()).symbols.map((s) => s.rot)) === r, [JSON.stringify(rots)], { what: `saved rotations ${rots}` });
  // nothing selected: Rotate disabled
  assert.equal(await page.eval((d) => document.querySelector(`${d} .se-btn[data-act=rotate]`).disabled, D), true);
  // Ctrl+A selects the AND2; Ctrl+R: 90, the toolbar's Rotate: 180, Ctrl+R: 270, the toolbar: 0
  await page.click(`${D} .se-svg`);   // focus the editor (an empty spot of the sheet)
  await page.key('a', { modifiers: 2 });
  await page.waitFor((d) => !document.querySelector(`${d} .se-btn[data-act=rotate]`).disabled, [D], { what: 'Rotate enabled' });
  await page.key('r', { modifiers: 2 });
  await waitRot([90]);
  await page.click(`${D} .se-btn[data-act=rotate]`);
  await waitRot([180]);
  await page.key('r', { modifiers: 2 });
  await waitRot([270]);
  await page.click(`${D} .se-btn[data-act=rotate]`);
  await waitRot([0]);
  assert.deepEqual((await saved()).symbols.map((s) => [s.type, s.rot, s.mirror]), [['and2', 0, false]]);
  // zoom: In x1.25, Out x0.8 (back), Full View fits the drawing; the status bar shows the zoom
  const zoom = () => page.eval((d) => [+/scale\(([\d.]+)\)/.exec(document.querySelector(`${d} .se-vp`).getAttribute('transform'))[1], document.querySelector(`${d} .zoom`).textContent], D);
  const [s0] = await zoom();
  await page.click(`${D} .se-btn[data-act=zin]`);
  const [s1, t1] = await zoom();
  assert.ok(Math.abs(s1 / s0 - 1.25) < 1e-6, `${s0} -> ${s1}`);
  assert.equal(t1, `${Math.round(s1 * 100)}%`);
  await page.click(`${D} .se-btn[data-act=zout]`);
  await page.click(`${D} .se-btn[data-act=zout]`);
  const [s2] = await zoom();
  assert.ok(Math.abs(s2 / s0 - 0.8) < 1e-6, `${s0} -> ${s2}`);
  await page.click(`${D} .se-btn[data-act=fit]`);
  const [s3, t3] = await zoom();
  assert.ok(s3 <= 2 && s3 > s2, `fit: ${s3}`);
  assert.equal(t3, `${Math.round(s3 * 100)}%`);
  // the palette's context menu: Symbol Info… and Place Symbol; placing, Ctrl+R turns the symbol before the click
  await page.fill(`${D} .se-search`, 'inv');
  await page.rightClick(`${D} .se-symrow`, { text: 'INV' });
  await page.waitForSelector('body > .menu-popup');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((e) => e.textContent)), ['Symbol Info…', 'Place Symbol']);
  await page.click('body > .menu-popup .mi', { text: 'Place Symbol' });
  await page.waitFor((d) => document.querySelector(`${d} .se-symrow.active`)?.textContent === 'INV', [D], { what: 'INV being placed' });
  await page.key('r', { modifiers: 2 });
  const c = await page.eval((d) => { const r = document.querySelector(`${d} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 60 }; }, D);
  await page.click(c);
  await page.key('Escape');
  await waitRot([0, 90]);
  assert.deepEqual((await saved()).symbols.map((s) => [s.type, s.rot]), [['and2', 0], ['inv', 90]]);
  // both selected (Ctrl+A): the properties' Rotate turns each
  await page.key('a', { modifiers: 2 });
  await page.waitFor((d) => document.querySelector(`${d} .se-ptitle`)?.textContent === '2 objects selected', [D], { what: 'two selected' });
  await page.click(`${D} .se-pbtns .btn`, { text: 'Rotate' });
  await waitRot([90, 180]);
  assert.deepEqual(page.dialogs, []);
});

uiTest('ASM chart editor: add a state, a decision and a case box, connect them, Generate VHDL', E, async (page) => {
  await makeProject(env, { name: 'AsmPj' });
  await page.openProject('AsmPj');
  // Tools ▸ ASM State Machine Editor… opens the New Source wizard on the ASM type
  await page.menu('Tools', 'ASM State Machine Editor…');
  await page.waitDialog('New Source Wizard');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .src-types .st.sel').textContent), 'State Machine (ASM)');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctrl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctrl.asm.json' && document.querySelector('.doc:not([hidden]) [data-node]'));
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const ids0 = new Set((await model()).nodes.map((n) => n.id));
  const tool = (label) => page.click('.doc:not([hidden]) .asm-toolbar .asm-btn', { text: label });
  // a point inside a node / port that is really on top (boxes may touch)
  const at = (sel) => page.eval((s) => {
    const e = document.querySelector(`.doc:not([hidden]) ${s}`);
    const r = e.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === e || e.contains(hit) || hit.closest(s) === e)) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  const arrange = async () => { await tool('Arrange'); await tool('Fit'); };
  // wait until the node stops moving (Arrange / Fit lay out over several frames on a slow machine)
  const settled = async (sel) => {
    let last = '';
    for (let i = 0; i < 40; i++) {
      const p = JSON.stringify(await at(sel));
      if (p === last) return JSON.parse(p);
      last = p;
      await new Promise((r) => setTimeout(r, 100));
    }
    return JSON.parse(last);
  };
  const isSel = (id) => page.eval((i) => !!document.querySelector(`.doc:not([hidden]) [data-node="${i}"]`)?.classList.contains('sel'), id);
  const select = async (id) => {
    await arrange();
    for (let k = 0; k < 3 && !await isSel(id); k++) {
      await page.click(await settled(`[data-node="${id}"]`));
      await page.waitFor((i) => document.querySelector(`.doc:not([hidden]) [data-node="${i}"]`)?.classList.contains('sel'), [id], { timeout: 3000 }).catch(() => {});
    }
    assert.ok(await isSel(id), `node ${id} selected`);
  };
  const newest = async (type) => (await model()).nodes.filter((n) => n.type === type && !ids0.has(n.id)).map((n) => n.id);
  // nothing selected: a free state
  await page.click('.doc:not([hidden]) .asm-canvas', {});
  await page.key('Escape');
  await tool('State');
  const [s0] = await newest('state');
  // with the new state selected: a decision on its exit, then a case box on the decision's 1 exit
  await tool('Decision');
  const [d0] = await newest('decision');
  await tool('Case');
  const [c0] = await newest('case');
  let m = await model();
  assert.ok(m.edges.some((e) => e.from === s0 && e.to === d0 && e.port === 'next'));
  assert.ok(m.edges.some((e) => e.from === d0 && e.to === c0 && e.port === 'true'));
  // two states on the case exits (one per value of the 1-bit input), one on the decision's 0 exit
  await select(c0); await tool('State');
  await select(c0); await tool('State');
  await select(d0); await tool('State');
  const added = await newest('state');
  assert.equal(added.length, 4);
  m = await model();
  assert.deepEqual(m.edges.filter((e) => e.from === c0).map((e) => e.port).sort(), ['0', '1']);
  assert.ok(m.edges.some((e) => e.from === d0 && e.port === 'false'));
  // the new end states go back to the initial state: drag from their free exit to IDLE
  const idle = m.nodes.find((n) => n.name === 'IDLE').id;
  for (const s of added.filter((x) => x !== s0)) {
    await arrange();
    await page.drag(await settled(`[data-node="${s}"] [data-port="next"]`), await settled(`[data-node="${idle}"]`));
    await page.waitFor((a, b) => window.Silinx.active.asmEditor.getModel().edges.some((e) => e.from === a && e.to === b), [s, idle], { what: `${s} -> IDLE` });
  }
  // the free state S0 is unreachable, and so are the states it leads to: warnings, not errors
  await page.click('.doc:not([hidden]) .asm-btn', { text: '✓ Validate' });
  await page.waitFor(() => /· 7 states · 0 errors/.test(document.querySelector('.doc:not([hidden]) .asm-status')?.textContent || ''), [], { what: 'chart valid' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .asm-problems .asm-prob')].map((li) => [li.className, li.textContent])), [
    ['asm-prob warning link', "▲State 'S0' is unreachable from the initial state"],
    ['asm-prob warning link', "▲State 'S1' is unreachable from the initial state"],
    ['asm-prob warning link', "▲State 'S2' is unreachable from the initial state"],
    ['asm-prob warning link', "▲State 'S3' is unreachable from the initial state"],
  ]);
  const final = await model();
  // Generate HDL: src/ctrl.vhd written, opened, linked to the chart
  await page.click('.doc:not([hidden]) .asm-btn.asm-primary');
  await page.waitConsole(/ASM chart 'src\/ctrl\.asm\.json' -> VHDL file src\/ctrl\.vhd/);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/ctrl.vhd');
  const vhd = await readWs(env, 'AsmPj', 'src/ctrl.vhd');
  assert.match(vhd, /entity ctrl is/i);
  for (const st of ['IDLE', 'RUN', 'FINISH', ...final.nodes.filter((n) => added.includes(n.id)).map((n) => n.name)]) assert.match(vhd, new RegExp(`\\b${st}\\b`), `state ${st} in the VHDL`);
  assert.match(vhd, /case/i);
  const lib = compile([{ path: 'src/ctrl.vhd', lang: 'vhdl', text: vhd }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'ctrl').diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  const saved = JSON.parse(await readWs(env, 'AsmPj', 'src/ctrl.asm.json'));
  assert.equal(saved.generatedFile, 'src/ctrl.vhd');
  assert.equal(saved.nodes.length, final.nodes.length);
  // the hierarchy shows the chart as the module
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .meta')].some((e) => e.textContent === '(ctrl.asm.json)'));
});

uiTest('ASM chart editor: Zoom / Fit, </> Code and Copy, Reset route / Delete connection, Swap 1 / 0 exits, a case exit\'s ✕, Delete box, # Snap, ↶ ↷ and Edit ▸ Undo / Redo (#195)', E, async (page) => {
  const chart = normalizeModel({
    name: 'ctl', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
    inputs: [{ name: 'start', width: 1 }, { name: 'op', width: 2 }], outputs: [{ name: 'busy', width: 1, default: '0' }],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', x: 200, y: 80, actions: [] },
      { id: 'd1', type: 'decision', x: 200, y: 190, cond: 'start' },
      { id: 's2', type: 'state', name: 'RUN', x: 200, y: 300, actions: ['busy = 1'] },
      { id: 'c1', type: 'case', x: 200, y: 410, expr: 'op' },
      { id: 's3', type: 'state', name: 'DONE', x: 200, y: 540, actions: [] },
    ],
    edges: [
      { id: 'e1', from: 's1', to: 'd1', port: 'next' }, { id: 'e2', from: 'd1', to: 's2', port: 'true' }, { id: 'e3', from: 'd1', to: 's1', port: 'false' },
      { id: 'e4', from: 's2', to: 'c1', port: 'next' }, { id: 'e5', from: 'c1', to: 's3', port: '01' }, { id: 'e6', from: 'c1', to: 's1', port: 'others' },
      { id: 'e7', from: 's3', to: 's1', port: 'next', points: [{ x: 400, y: 540 }, { x: 400, y: 80 }] },
    ],
    initial: 's1',
  });
  await makeProject(env, { name: 'AsmEd', files: { 'src/ctl.asm.json': JSON.stringify(chart, null, 2) } });
  await page.openProject('AsmEd');
  // (the chart gets its HDL file when the project opens: every source has its HDL, #207)
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.asm.json', [], { what: 'the chart linked to its HDL' });
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl.asm.json' && document.querySelector('.doc:not([hidden]) [data-node=s3]'), [], { what: 'ASM editor' });
  const D = '.doc:not([hidden])';
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const problems = () => page.eval(() => window.Silinx.active.asmEditor.validate().map((d) => `${d.severity}: ${d.message}`));
  const tool = (label) => page.click(`${D} .asm-toolbar .asm-btn`, { text: label });
  const side = (label) => page.click(`${D} .asm-selection .asm-btn`, { text: label });
  const edges = async () => (await model()).edges.map((e) => `${e.id}:${e.from}>${e.to}:${e.port}`).join(' ');
  const E0 = 'e1:s1>d1:next e2:d1>s2:true e3:d1>s1:false e4:s2>c1:next e5:c1>s3:01 e6:c1>s1:others e7:s3>s1:next';
  const zoom = () => page.eval((d) => document.querySelector(`${d} .asm-zoom`).textContent, D);
  assert.equal(await edges(), E0);
  assert.deepEqual(await problems(), []);
  // a point on top in a node (boxes may touch), or in the middle of a connection
  const nodeAt = (id) => page.eval((d, i) => {
    const e = document.querySelector(`${d} [data-node="${i}"]`);
    const r = e.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest('[data-node]') === e) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, D, id);
  const edgeAt = (id) => page.eval((d, i) => {
    const p = document.querySelector(`${d} [data-edge="${i}"] .asm-edge-hit`);
    const c = p.getScreenCTM(), L = p.getTotalLength();
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const q = p.getPointAtLength(L * f);
      const x = c.a * q.x + c.c * q.y + c.e, y = c.b * q.x + c.d * q.y + c.f;
      if (document.elementFromPoint(x, y)?.closest('[data-edge]')?.dataset.edge === i) return { x, y };
    }
    return null;
  }, D, id);
  const pick = async (what, id) => {
    for (let k = 0; k < 20; k++) {
      const ok = await page.eval((d, w, i) => (w === 'edge' ? !!document.querySelector(`${d} [data-edge="${i}"].sel`) : !!document.querySelector(`${d} [data-node="${i}"].sel`)), D, what, id);
      if (ok) return;
      const p = what === 'edge' ? await edgeAt(id) : await nodeAt(id);
      if (p) await page.click(p);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`${what} ${id} not selected`);
  };

  // ---- Zoom / Fit: the zoom label follows the buttons; Fit gives the fitted zoom back
  await new Promise((r) => setTimeout(r, 300));   // (the fit on activation)
  await tool('Fit');
  const fitted = await zoom();
  const k = parseFloat(await page.eval((d) => /scale\(([\d.]+)\)/.exec(document.querySelector(`${d} .asm-vp`).getAttribute('transform'))[1], D));
  assert.equal(fitted, `${Math.round(k * 100)}%`);
  await tool('+');
  assert.equal(await zoom(), `${Math.round(k * 120)}%`);
  await tool('−'); await tool('−');
  assert.equal(await zoom(), `${Math.round(k * 100 / 1.2)}%`);
  await tool('Fit');
  assert.equal(await zoom(), fitted);

  // ---- </> Code: the HDL of the chart; Copy puts it on the clipboard; ✕ hides it
  await page.eval(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); });
  await tool('</> Code');
  await page.waitForSelector(`${D} .asm-codepanel .asm-code`);
  const code = generate(chart).code;
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-code-title`).textContent, D), 'ctl.vhd');
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-code`).textContent, D), code);
  await page.click(`${D} .asm-codebar .asm-btn`, { text: 'Copy' });
  await page.waitFor(() => window.__copied != null, [], { what: 'code copied' });
  assert.equal(await page.eval(() => window.__copied), code);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-status-msg`).textContent, D), 'Code copied to clipboard');
  await page.click(`${D} .asm-codebar .asm-btn`, { text: '✕' });
  assert.ok(await page.eval((d) => document.querySelector(`${d} .asm-codepanel`).hidden, D));

  // ---- a connection with a route: Reset route, ↶ ↷; Delete connection, Edit ▸ Undo / Redo
  await pick('edge', 'e7');
  await side('Reset route');
  assert.ok(!('points' in (await model()).edges.find((e) => e.id === 'e7')));
  assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .asm-selection .asm-btn`)].some((b) => b.textContent === 'Reset route'), D), false, 'no route: no Reset route button (#202)');
  await tool('↶');
  assert.deepEqual((await model()).edges.find((e) => e.id === 'e7').points, [{ x: 400, y: 540 }, { x: 400, y: 80 }]);
  await tool('↷');
  assert.ok(!('points' in (await model()).edges.find((e) => e.id === 'e7')));
  await tool('↶');
  await pick('edge', 'e7');
  await side('Delete connection');
  assert.equal(await edges(), E0.replace(' e7:s3>s1:next', ''));
  assert.deepEqual(await problems(), PROBLEMS_ASM_NO_E7);
  await page.menu('Edit', 'Undo');
  assert.equal(await edges(), E0);
  await page.menu('Edit', 'Redo');
  assert.equal(await edges(), E0.replace(' e7:s3>s1:next', ''));
  await page.menu('Edit', 'Undo');
  assert.deepEqual((await model()).edges.find((e) => e.id === 'e7').points, [{ x: 400, y: 540 }, { x: 400, y: 80 }]);

  // ---- Swap 1 / 0 exits of the decision, and back with ↶
  await pick('node', 'd1');
  await side('Swap 1 / 0 exits');
  assert.equal(await edges(), E0.replace('e2:d1>s2:true e3:d1>s1:false', 'e2:d1>s2:false e3:d1>s1:true'));
  await tool('↶');
  assert.equal(await edges(), E0);

  // ---- the ✕ of a case exit: 01 -> DONE removed (DONE unreachable); ↶ brings it back
  await pick('node', 'c1');
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .asm-case-list .asm-row`)].map((r) => `${r.querySelector('input').value} ${r.querySelector('.asm-muted').textContent}`), D), ['01 → DONE', 'others → IDLE']);
  await page.click(`${D} .asm-case-list .asm-row .asm-btn`, { text: '✕' });
  assert.equal(await edges(), E0.replace(' e5:c1>s3:01', ''));
  assert.deepEqual(await page.eval((d) => document.querySelectorAll(`${d} .asm-case-list .asm-row`).length, D), 1);
  assert.deepEqual(await problems(), PROBLEMS_ASM_NO_E5);
  await tool('↶');
  assert.equal(await edges(), E0);

  // ---- Delete box: DONE and its connections; ↶ / ↷ with the toolbar
  await pick('node', 's3');
  await side('Delete box');
  let m = await model();
  assert.deepEqual([m.nodes.map((n) => n.id), m.edges.map((e) => e.id)], [['s1', 'd1', 's2', 'c1'], ['e1', 'e2', 'e3', 'e4', 'e6']]);
  await tool('↶');
  m = await model();
  assert.deepEqual([m.nodes.map((n) => n.id), m.edges.map((e) => e.id)], [chart.nodes.map((n) => n.id), chart.edges.map((e) => e.id)]);
  await tool('↷');
  assert.equal((await model()).nodes.length, 4);
  await page.menu('Edit', 'Undo');
  assert.deepEqual(await model(), { ...chart, generatedFile: 'src/ctl.vhd' });   // (and the link to its HDL file, #207)

  // ---- # Snap: a box dragged lands on the 20-unit grid; with snapping off, where it is dropped
  const drag = async (id, dx, dy) => {
    const before = (await model()).nodes.find((n) => n.id === id);
    await pick('node', id);
    const p = await nodeAt(id);
    await page.drag(p, { x: p.x + dx, y: p.y + dy });
    await page.waitFor((i, x, y) => { const n = window.Silinx.active.asmEditor.getModel().nodes.find((q) => q.id === i); return n.x !== x || n.y !== y; }, [id, before.x, before.y], { what: `${id} moved` });
    return (await model()).nodes.find((n) => n.id === id);
  };
  assert.ok(await page.eval((d) => [...document.querySelectorAll(`${d} .asm-toolbar .asm-btn`)].find((b) => b.textContent === '# Snap').classList.contains('on'), D));
  let n = await drag('s3', 47, 0);
  assert.deepEqual([n.x % 20, n.y], [0, 540]);
  await tool('# Snap');
  assert.ok(!await page.eval((d) => [...document.querySelectorAll(`${d} .asm-toolbar .asm-btn`)].find((b) => b.textContent === '# Snap').classList.contains('on'), D));
  const x1 = n.x;
  n = await drag('s3', 7, 0);
  assert.ok(n.x % 20 !== 0 && n.x > x1 && n.x < x1 + 20, `x = ${n.x}`);
  assert.equal(n.y, 540);
  // saved as edited
  await page.waitFor(async (x) => (await (await fetch('/api/projects/AsmEd/file?path=src%2Fctl.asm.json')).json()).nodes.find((q) => q.id === 's3').x === x, [n.x], { what: 'saved', timeout: 15000 });
  assert.deepEqual(JSON.parse(await readWs(env, 'AsmEd', 'src/ctl.asm.json')), await model());
});

uiTest('print preview of a diagram: File ▸ Print… dialog, Save SVG, Print… opens the print page', E, async (page) => {
  await makeProject(env, { name: 'PrintPj', template: 'blinky' });
  await page.openProject('PrintPj');
  await page.eval(() => window.SilinxApp.openAsm('src/speed_ctrl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.asmEditor && document.querySelector('.doc:not([hidden]) [data-node]'));
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — ASM chart speed_ctrl');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /\d+ pages? \(\d+ across × \d+ down\), A4 (landscape|portrait)/);
  // two pages across: the page count follows
  await page.eval(() => { const i = document.querySelector('.dlg-overlay input[type=number]'); i.value = '2'; i.dispatchEvent(new Event('input')); });
  await page.waitFor(() => /\(2 across/.test(document.querySelector('.dlg-overlay').innerText));
  await page.dialogButton('Save SVG');
  const svgFile = await waitDownload(page, 'speed_ctrl_asm.svg');
  const fs = await import('node:fs/promises');
  assert.match(await fs.readFile(svgFile, 'utf8'), /^<svg[\s\S]*IDLE[\s\S]*<\/svg>\s*$/);
  // Print…: a new page with the drawing (Ctrl+P does the same)
  await page.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
  const pages = async () => (await env.cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page' && t.browserContextId === page.contextId);
  const before = (await pages()).length;
  await page.key('p', { modifiers: 2 });
  await page.waitDialog('Print — ASM chart speed_ctrl');
  await page.dialogButton('Print…');
  await page.waitNoDialog();
  const t0 = Date.now();
  let opened = false;
  while (Date.now() - t0 < 5000 && !opened) {
    opened = (await pages()).length > before || await page.eval(() => !!document.querySelector('iframe'));
    if (!opened) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(opened, 'the print page was opened');
}, { skip: chromeOnly });   // (the new page is found with Target.getTargets)
