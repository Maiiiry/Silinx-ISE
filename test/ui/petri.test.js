// UI: the Petri net editor (web/js/petri-editor.js, #186, #187): a new net from the Tools menu, a place
// added and undone, the simulation (a transition fired by a click, a clock step, the outputs), the HDL,
// the net as a module of the project (the top, no HDL file), the Portuguese interface.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, waitDownload } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .petri-editor';

uiTest('Petri net editor: new net, a place added and undone, the token game and the clock step, the HDL, the net as the top module', E, async (page) => {
  await makeProject(env, { name: 'PnPj', top: '' });
  await page.openProject('PnPj');
  await page.menu('Tools', 'Petri Net Editor…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'pn:src/ctl.pn.json' && document.querySelector(ed), [ED], { what: 'the Petri net editor' });
  const count = () => page.eval((ed) => document.querySelector(`${ed} .asm-status`).textContent, ED);
  await page.waitFor((ed) => /2 places · 2 transitions · 4 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED]);
  // the Place tool, a click on the drawing: a third place; Edit ▸ Undo takes it away
  await page.click(`${ED} .pn-tool`, { text: 'Place' });
  const box = await page.eval((ed) => { const r = document.querySelector(`${ed} .pn-canvas`).getBoundingClientRect(); return { x: r.left + r.width - 80, y: r.top + r.height - 60 }; }, ED);
  await page.click({ x: box.x, y: box.y });
  await page.waitFor((ed) => /^3 places/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'a place added' });
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => /^2 places/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'undone' });
  assert.match(await count(), /2 places/);
  // the simulation: start is enabled but its guard (go) is false; go: it is ready, a click fires it
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  await page.click(`${ED} .pn-tab-btn`, { text: '▶ Simulate' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-trans[data-id=t1]`)?.classList.contains('enabled'), [ED], { what: 'start enabled, guard false' });
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-trans[data-id=t1]`).classList.contains('ready'), [ED], { what: 'start ready' });
  const at = await page.eval((ed) => { const r = document.querySelector(`${ed} .pn-trans[data-id=t1] rect`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.click({ x: at.x, y: at.y });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=1', [ED], { what: 'start fired' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .pn-outs-now`).textContent, ED), 'busy=1');
  // go off, a clock step: done fires, back to idle
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '⏭ Clock step' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0', [ED], { what: 'done fired at the clock step' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .pn-log`).textContent, ED), /clock: done/);
  // the HDL
  await page.click(`${ED} .pn-tab-btn`, { text: '</> HDL' });
  await page.waitFor((ed) => /entity ctl is/.test(document.querySelector(`${ed} .pn-code`)?.textContent || ''), [ED], { what: 'the VHDL' });
  // the net is a module of the project by itself (#177): Set as Top Module, no HDL file
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'ctl'), [], { what: 'ctl in the hierarchy' });
  await page.treeRow('#hier', 'ctl', { right: true, exact: true });
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitFor(() => window.Silinx.project.top === 'ctl', [], { what: 'ctl is the top' });
  assert.equal(JSON.parse(await readWs(env, 'PnPj', 'src/ctl.pn.json')).generatedFile, undefined);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .pn-tool`)].some((b) => b.textContent.trim() === 'Lugar'), [ED], { what: 'the toolbar in Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
});

// a new net in a project, opened in the editor
async function newNet(page, pj) {
  await makeProject(env, { name: pj, top: '' });
  await page.openProject(pj);
  await page.menu('Tools', 'Petri Net Editor…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => /2 places · 2 transitions · 4 arcs/.test(document.querySelector(`${ed} .asm-status`)?.textContent || ''), [ED], { what: 'the Petri net editor' });
}
const node = (page, id) => page.eval((ed, i) => { const r = document.querySelector(`${ed} [data-id=${i}] ${i[0] === 'p' ? 'circle' : 'rect'}`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED, id);
const statusOf = (page) => page.eval((ed) => document.querySelector(`${ed} .asm-status`).textContent, ED);
const problems = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-prob`)].map((li) => `${li.classList.contains('warning') ? 'warning' : 'error'}: ${li.textContent}`), ED);
const saved = async (pj) => JSON.parse(await readWs(env, pj, 'src/ctl.pn.json'));
async function setField(page, label, value) {
  const ok = await page.eval((ed, l, v) => {
    const f = [...document.querySelectorAll(`${ed} .asm-side .asm-field`)].find((x) => x.querySelector('.asm-label')?.textContent === l);
    const i = f?.querySelector('input, textarea'); if (!i) return false;
    i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, ED, label, String(value));
  assert.ok(ok, `field ${label}`);
}

uiTest('Petri net editor: arcs and inhibitor arcs drawn, delete / undo / redo, the properties, priorities, the problems (exact)', E, async (page) => {
  await newNet(page, 'PnEd');
  // a third transition, arcs work → t3 → idle
  await page.click(`${ED} .pn-tool`, { text: 'Transition' });
  const box = await page.eval((ed) => { const r = document.querySelector(`${ed} .pn-canvas`).getBoundingClientRect(); return { x: r.left + r.width - 70, y: r.top + r.height - 70 }; }, ED);
  await page.click(box);
  await page.waitFor((ed) => /3 transitions/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 't3 added' });
  await page.click(`${ED} .pn-tool`, { text: '→ Arc' });
  await page.click(await node(page, 'p2')); await page.click(await node(page, 't3'));
  await page.click(await node(page, 't3')); await page.click(await node(page, 'p1'));
  await page.waitFor((ed) => /6 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'two arcs drawn' });
  // a place to a place: refused
  await page.click(await node(page, 'p1')); await page.click(await node(page, 'p2'));
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status-msg`).textContent === 'An arc joins a place and a transition', [ED]);
  // an inhibitor arc work ⊸ start; from a transition: refused
  await page.click(`${ED} .pn-tool`, { text: '⊸ Inhibitor' });
  await page.click(await node(page, 't1')); await page.click(await node(page, 'p1'));
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status-msg`).textContent === 'An inhibitor arc goes from a place to a transition', [ED]);
  await page.click(await node(page, 'p2')); await page.click(await node(page, 't1'));
  await page.waitFor((ed) => /7 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent) && document.querySelector(`${ed} .pn-arc.inhibitor`), [ED], { what: 'the inhibitor arc' });
  await new Promise((r) => setTimeout(r, 1500));
  let m = await saved('PnEd');
  assert.deepEqual(m.arcs.slice(4).map((a) => [a.from, a.to, !!a.inhibitor]), [['p2', 't3', false], ['t3', 'p1', false], ['p2', 't1', true]]);
  // the inhibitor arc is selected: ✕ deletes it, ↶ brings it back, ↷ deletes it again
  await page.click(`${ED} .asm-danger`, { text: '✕' });
  await page.waitFor((ed) => /6 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'deleted' });
  await page.click(`${ED} button`, { text: '↶' });
  await page.waitFor((ed) => /7 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'undone' });
  await page.click(`${ED} button`, { text: '↷' });
  await page.waitFor((ed) => /6 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'redone' });
  // the properties: idle 2 tokens (its capacity follows), t3 a guard, a pulse, the first in priority
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  await page.click(await node(page, 'p1'));
  await setField(page, 'Initial tokens', 2);
  await page.click(await node(page, 't3'));
  await setField(page, 'Guard', 'go');
  await setField(page, 'Pulses when it fires', 'busy=1');
  await page.click(`${ED} .asm-small`, { text: '▲ Higher' });
  await page.click(`${ED} .asm-small`, { text: '▲ Higher' });
  await page.waitFor((ed) => /Priority 1 of 3/.test(document.querySelector(`${ed} .pn-selection`).textContent), [ED], { what: 't3 first' });
  await new Promise((r) => setTimeout(r, 1500));
  m = await saved('PnEd');
  assert.deepEqual(m.places.map((p) => [p.name, p.tokens, p.capacity]), [['idle', 2, 2], ['work', 0, 1]]);
  assert.deepEqual(m.transitions.map((t) => [t.name, t.guard, t.outputs]), [['t1', 'go', { busy: '1' }], ['start', 'go', {}], ['done', '!go', {}]]);
  assert.deepEqual(await problems(page), []);
  // the problems, exact: a place alone, a guard that does not parse, an output not of the net
  await page.click(`${ED} .pn-tool`, { text: 'Place' });
  await page.click({ x: box.x, y: box.y - 120 });
  await page.waitFor((ed) => /3 places/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED]);
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  await page.click(await node(page, 't3'));
  await setField(page, 'Guard', 'go &');
  await page.click(await node(page, 'p2'));
  await setField(page, 'Outputs while marked', 'zz=1');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .asm-prob`).length === 3, [ED], { what: 'three problems' });
  assert.deepEqual(await problems(page), [
    "error: transition t1: guard 'go &': unexpected end of expression",
    "error: work: 'zz' is not an output of the net",
    'warning: place p1 is not connected',
  ]);
  // a click on a problem selects what it is about
  await page.click(`${ED} .asm-prob`, { text: 'place p1 is not connected' });
  await page.waitFor((ed) => /^Place p1/.test(document.querySelector(`${ed} .pn-selection .asm-section-title`)?.textContent || ''), [ED], { what: 'p1 selected' });
});

uiTest('Petri net editor: Random, Run / Stop, Reset; PNML export and import (undone); the HDL file generated and kept in sync', E, async (page) => {
  await newNet(page, 'PnSim');
  await page.click(`${ED} .pn-tab-btn`, { text: '▶ Simulate' });
  const marking = () => page.eval((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent, ED);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0', [ED]);
  // Random: go off, nothing can fire; go on: start fires
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '🎲 Random' });
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status-msg`).textContent === 'No transition is enabled with these inputs', [ED], { what: 'nothing enabled' });
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '🎲 Random' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=1', [ED], { what: 'start fired at random' });
  // Reset: back to the initial marking, the log empty
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '⟲ Reset' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0' && !document.querySelector(`${ed} .pn-log li`), [ED], { what: 'reset' });
  // Run (go still on): start fires at a clock step; Stop
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '▶▶ Run' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=1', [ED], { what: 'start fired while running', timeout: 5000 });
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '■ Stop' });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .asm-codebar .asm-btn`)].some((b) => b.textContent === '▶▶ Run'), [ED], { what: 'stopped' });
  const m1 = await marking();
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await marking(), m1, 'no clock step once stopped');
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .pn-log`).textContent, ED), /clock: start/);
  // PNML export: the net as PNML, read back by core/petri.js
  await page.click(`${ED} button`, { text: 'PNML ⇩' });
  const f = await waitDownload(page, 'ctl.pnml');
  const { fromPnml, newPetri, normalizePetri } = await import('../../core/petri.js');
  assert.deepEqual(fromPnml(await fs.readFile(f, 'utf8')), normalizePetri(newPetri('ctl')));
  // PNML import: a net of another tool replaces this one; Undo brings it back
  const pnml = path.join(page.downloadDir, 'other.pnml');
  await fs.writeFile(pnml, `<?xml version="1.0"?><pnml><net id="n" type="P/T net"><place id="P0"><name><text>a</text></name><initialMarking><text>1</text></initialMarking></place>
    <place id="P1"><name><text>b</text></name></place><transition id="T0"><name><text>go_on</text></name></transition>
    <arc id="x" source="P0" target="T0"/><arc id="y" source="T0" target="P1"/></net></pnml>`);
  await page.setFiles(`${ED} input[type=file]`, [pnml]);
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status`).textContent.startsWith('2 places · 1 transitions · 2 arcs'), [ED], { what: 'imported' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent, ED), 'a=1  b=0');
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => /2 places · 2 transitions · 4 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'the import undone' });
  // the HDL file: Generate HDL file from the hierarchy's menu, then kept in sync with the net
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'ctl'), [], { what: 'ctl in the hierarchy' });
  await page.treeRow('#hier', 'ctl', { right: true, exact: true });
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL file' });
  await page.waitFor(() => window.Silinx.project.files.some((x) => x.path === 'src/ctl.vhd'), [], { what: 'src/ctl.vhd added' });
  await page.waitFor(() => /kept in sync/.test(document.querySelector('.doc:not([hidden]) .petri-editor .gen-banner')?.textContent || ''), [], { what: 'the link banner' });
  assert.match(await readWs(env, 'PnSim', 'src/ctl.vhd'), /entity ctl is[\s\S]*busy : out std_logic/);
  await setField(page, 'Outputs', 'busy, ready');
  await new Promise((r) => setTimeout(r, 1500));
  assert.match(await readWs(env, 'PnSim', 'src/ctl.vhd'), /ready : out std_logic/, 'the HDL file follows the net');
  assert.equal((await saved('PnSim')).generatedFile, 'src/ctl.vhd');
});
