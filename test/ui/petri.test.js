// UI: the Petri net editor (web/js/petri-editor.js, #186, #187): a new net from the Tools menu, a place
// added and undone, the simulation (a transition fired by a click, a clock step, the outputs), the HDL,
// the net as a module of the project (the top, no HDL file), the Portuguese interface.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

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
