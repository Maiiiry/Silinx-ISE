// UI (#1508): Emulate and Program FPGA with no pins set (no UCF, or a UCF that places no port) ask first: "Pins not
// set", I/O Pin Planning (opens it) or Cancel, nothing emulated nor programmed; with a pin placed they go on. Both
// interfaces (SILINX_UI_INTERFACE); in Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const INV = 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture r of inv is begin y <= not a; end r;\n';
const dlg = (page) => page.eval(() => { const d = [...document.querySelectorAll('.dlg-overlay')].pop(); return d ? { title: d.querySelector('.dlg-title')?.textContent.replace('✕', '').trim(), text: d.querySelector('.pins-unset')?.innerText.replace(/\s+/g, ' ').trim(), buttons: [...d.querySelectorAll('.dlg-buttons button')].map((b) => b.textContent) } : null; });
const emulate = (page) => page.eval(() => { import('/js/viewers.js').then((v) => v.openEmulator('inv')); });   // (not awaited: it waits on the dialog)
const program = (page) => page.eval(async () => { await window.SilinxApp.openImpact(); window.SilinxApp.findDoc('impact').program(); });

uiTest('#1508 Emulate and Program FPGA with no pins set: "Pins not set", I/O Pin Planning or Cancel; nothing run; a pin placed: on; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'NoPins', board: 'basys2', top: 'inv', files: { 'src/inv.vhd': INV, 'constraints/inv.ucf': '# no pins yet\nNET "a" IOSTANDARD = LVCMOS33;\n' }, constraints: 'constraints/inv.ucf' });
  await page.setViewport(1366, 768);
  await page.openProject('NoPins');
  // Emulate: asked, Cancel: no emulator
  await emulate(page);
  await page.waitDialog('Pins not set');
  assert.deepEqual(await dlg(page), { title: 'Pins not set', text: "The design's pins are not set yet: no port is placed on a pin of the board. Set them before you emulate the design.", buttons: ['I/O Pin Planning', 'Cancel'] });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('emulator')), false, 'nothing emulated');
  // I/O Pin Planning: the pin planner opened
  await emulate(page);
  await page.waitDialog('Pins not set');
  await page.dialogButton('I/O Pin Planning');
  await page.waitFor(() => /^pins/.test(window.Silinx.active?.id || ''), [], { what: 'the pin planner' });
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('emulator')), false);
  // Program FPGA: asked too, the board's message; Cancel programs nothing (no "implement first" question after it)
  await program(page);
  await page.waitDialog('Pins not set');
  assert.equal((await dlg(page)).text, "The design's pins are not set yet: no port is placed on a pin of the board. Set them before you program the board.");
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await emulate(page);
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .pins-unset'), [], { what: 'the alert' });
  assert.deepEqual(await dlg(page), { title: 'Pinos por definir', text: 'Os pinos do projeto ainda não estão definidos: nenhuma porta está ligada a um pino da placa. Defina-os antes de emular o projeto.', buttons: ['Planeamento de Pinos de E/S', 'Cancelar'] });
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons button')].pop().click());
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // a pin placed: Emulate goes on, no question
  await page.eval(async () => { const S = window.SilinxApp.S; await (await import('/js/api.js')).api.writeFile(S.project.name, 'constraints/inv.ucf', 'NET "a" LOC = "P11";\nNET "y" LOC = "M5";\n'); });
  await emulate(page);
  await page.waitFor(() => !!window.SilinxApp.findDoc('emulator') || !!document.querySelector('.dlg-overlay .pins-unset'), [], { what: 'the emulator', timeout: 20000 });
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay .pins-unset')), false, 'not asked');
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('emulator')), true);
});
