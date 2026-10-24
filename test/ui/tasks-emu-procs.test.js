// UI (#1204): Tasks ▸ Emulate has its Processes at the top of its side column, under a tab named Emulate (#1212): the top
// module's User Constraints (I/O Pin Planning, Edit Constraints (Text), Check Constraints) and Emulate on Board with
// its models, the same as Implement's (web/js/processes.js emulateProcesses), each run by a double-click, its state
// the Processes panel's; in Portuguese; folded with the side panel; none in the classic interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };

async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
const BOX = '.doc:not([hidden]) .emu-side > .task-emu-procs';
// Emulate's Processes as shown: the tab, the rows (their depth), whether the box is shown and first in the column
const procs = (page) => page.eval((b) => {
  const box = document.querySelector(b);
  if (!box) return null;
  const depth = (li) => { let d = 0; for (let p = li.parentElement.closest('li'); p; p = p.parentElement.closest('li')) d++; return d; };
  return {
    shown: box.getClientRects().length > 0, first: box.parentElement.firstElementChild === box,
    tab: box.querySelector('.task-sim-tabs .tab-lbl')?.textContent,
    rows: [...box.querySelectorAll('.task-emu-tree li')].map((li) => `${'  '.repeat(depth(li))}${li.querySelector(':scope > .row .lbl').textContent}`),
  };
}, BOX);
const row = (page, label) => page.eval((b, l) => {
  const r = [...document.querySelectorAll(`${b} .task-emu-tree .row`)].find((x) => x.querySelector('.lbl').textContent === l);
  r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}, BOX, label);
const EN = ['User Constraints', '  I/O Pin Planning', '  Edit Constraints (Text)', '  Check Constraints', 'Emulate on Board',
  '  Emulate Behavioral Model (RTL)', '  Emulate Post-Synthesis Model', '  Emulate Post-Translate Model', '  Emulate Post-Map Model',
  '  Emulate Post-Place & Route Model'];

uiTest('#1204 Tasks ▸ Emulate: its Processes, the top\'s User Constraints and Emulate on Board, run from there; in Portuguese; classic none', E, async (page) => {
  await makeProject(env, { name: 'EmuProcs', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('EmuProcs');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  await page.waitFor((b) => document.querySelectorAll(`${b} .task-emu-tree li`).length > 0, [BOX], { what: 'Emulate\'s Processes' });
  assert.deepEqual(await procs(page), { shown: true, first: true, tab: 'Emulate', rows: EN });
  // the Watch below it, as before
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-side .emu-box h4')?.textContent), 'Watch');
  // a state: the Processes panel's, drawn in Emulate too
  await page.eval(() => { window.SilinxApp.S.status['ucf-check'] = 'ok'; window.SilinxApp.renderProcesses(); });
  assert.ok(await page.eval((b) => !!document.querySelector(`${b} li[data-proc="ucf-check"] > .row .status svg`), BOX), 'Check Constraints\' state');
  assert.deepEqual((await procs(page)).rows, EN, 'redrawn the same');
  // Check Constraints: the project's UCF checked
  await row(page, 'Check Constraints');
  await page.waitConsole(/Process "Check Constraints" completed successfully/);
  // Edit Constraints (Text): the UCF opens (Design's document)
  await row(page, 'Edit Constraints (Text)');
  await page.waitFor(() => /\.ucf$/.test(window.SilinxApp.S.active?.title || ''), [], { what: 'the UCF' });
  // back to Emulate: I/O Pin Planning (Implement's document)
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await row(page, 'I/O Pin Planning');
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'pins', [], { what: 'the pin planner' });
  // in Portuguese
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((b) => document.querySelector(`${b} .task-sim-tabs .tab-lbl`)?.textContent === 'Emular', [BOX], { what: 'Portuguese' });
  assert.deepEqual((await procs(page)).rows.slice(0, 5), ['Restrições do Utilizador', '  Planeamento de Pinos de E/S', '  Editar Restrições (Texto)', '  Verificar Restrições', 'Emular na Placa']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // folded with the side panel
  await page.click('#task-view [data-act="side"]');
  assert.equal((await procs(page)).shown, false, 'folded');
  await page.click('#task-view [data-act="side"]');
  assert.equal((await procs(page)).shown, true);
  // the classic interface: none
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal((await procs(page)).shown, false, 'classic: none');
  await noWarnings(page);
}, { build: DEV });
