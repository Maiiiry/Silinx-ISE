// UI (#1224): Tasks ▸ Implement with no top module says so in its empty list (no Design Summary/Reports either, #1287) and offers
// Set Top Module…: the top chosen among the design's modules (the hierarchy's roots first, no test bench), then its
// processes; in Portuguese; none in the classic interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };

const INV = 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture r of inv is begin y <= not a; end r;\n';
const TOP = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (x : in std_logic; z : out std_logic); end top;\narchitecture r of top is begin u : entity work.inv port map (a => x, y => z); end r;\n';
const OTHER = 'module other(input p, output q); assign q = p; endmodule\n';
async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
const note = (page) => page.eval(() => {
  const n = document.querySelector('#procs .task-no-top');
  return n && n.getClientRects().length ? { text: n.querySelector('p').textContent, button: n.querySelector('button').textContent } : null;
});
const rows = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].filter((e) => e.getClientRects().length).map((e) => e.textContent));

uiTest('#1224 Tasks ▸ Implement with no top module: said so, Set Top Module… chooses one; Portuguese; classic none', E, async (page) => {
  await makeProject(env, { name: 'NoTop', top: '', files: { 'src/inv.vhd': INV, 'src/top.vhd': TOP, 'src/other.v': OTHER } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('NoTop');
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); window.SilinxApp.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => !!document.querySelector('#procs .task-no-top'), [], { what: 'the note' });
  assert.deepEqual(await rows(page), [], 'no processes, no Design Summary/Reports (#1287)');
  assert.deepEqual(await note(page), { text: 'No top module is set: the design is implemented from its top module, so set one to see its processes.', button: 'Set Top Module…' });
  // Set Top Module…: the roots first (top, other), then the others (inv)
  await page.click('#procs .task-no-top button');
  await page.waitDialog('Set Top Module');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select option')].map((o) => o.value)), ['other', 'top', 'inv']);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select'); s.value = 'top'; });
  await page.dialogButton('OK');
  await page.waitFor(() => window.Silinx.project.top === 'top' && [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize')), [], { what: 'the top set, its processes' });
  assert.equal(await note(page), null, 'no note with a top');
  assert.equal((await rows(page))[0], 'Design Summary/Reports', 'the Design Summary with a top (#1287)');
  assert.equal((await env.server.api('GET', '/api/projects/NoTop')).top, 'top');
  // in Portuguese
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); window.SilinxApp.renderProcesses(); });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#procs .task-no-top button')?.textContent === 'Definir Módulo de Topo…', [], { what: 'Portuguese' });
  assert.match((await note(page)).text, /^Não está definido nenhum módulo de topo/);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface: none
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  await page.eval(() => window.SilinxApp.renderProcesses());
  assert.equal(await note(page), null, 'classic');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV });
