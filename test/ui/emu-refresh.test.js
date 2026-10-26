// UI (#1401): the Board Emulator follows the design: a source saved with a change, or the constraints (the pins)
// changed, run its emulation again, its settings kept, behind the document in front (whose task stays in front); a save
// with no change runs nothing again. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const INV = 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (sw : in std_logic; led : out std_logic); end inv;\narchitecture r of inv is begin led <= not sw; end r;\n';
const UCF = 'NET "sw" LOC = "P11";\nNET "led" LOC = "M5";\n';
const runs = (page) => page.eval(() => (document.getElementById('console-log').textContent.match(/Board Emulator: 'inv'/g) || []).length);
const ran = (page, n, what, timeout = 30000) => page.waitFor((k) => (document.getElementById('console-log').textContent.match(/Board Emulator: 'inv'/g) || []).length === k && !!window.SilinxApp.findDoc('emulator')?.view, [n], { what, timeout });

uiTest('#1401 the Board Emulator runs the design again when a source or the constraints change, behind the document in front', E, async (page) => {
  await makeProject(env, { name: 'EmuRefresh', top: 'inv', board: 'basys2', files: { 'src/inv.vhd': INV, 'constraints/inv.ucf': UCF }, constraints: 'constraints/inv.ucf' });
  await page.openProject('EmuRefresh');
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator(window.Silinx.project.top));
  await ran(page, 1, 'the emulator', 60000);
  // the source opened in front, saved with no change: nothing run again
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/inv.vhd', [], { what: 'the source' });
  await page.eval(async () => { await window.Silinx.active.save(); });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await runs(page), 1, 'a save with no change');
  // a change saved: run again, behind the source, which stays in front
  await page.eval(async () => { const d = window.Silinx.active; d.editor.setValue(d.editor.getValue().replace('led <= not sw;', 'led <= sw;')); await d.save(); });
  await ran(page, 2, 'run again');
  assert.equal(await page.eval(() => window.Silinx.active.id), 'file:src/inv.vhd', 'the source still in front');
  // the constraints changed (the LED on another pin): run again
  await page.eval(() => window.SilinxApp.openFile('constraints/inv.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/inv.ucf', [], { what: 'the UCF' });
  await page.eval(async () => { const d = window.Silinx.active; d.editor.setValue(d.editor.getValue().replace('M5', 'M11')); await d.save(); });
  await ran(page, 3, 'run again with the new pins');
  assert.equal(await page.eval(() => window.Silinx.active.id), 'file:constraints/inv.ucf');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
