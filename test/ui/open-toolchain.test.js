// UI: the toolchain mode "Silinx toolchain (experimental, no ISE)": chosen in Toolchain Settings (with
// the status of the project's device; no ISE setting nor Build Device Description, #8), Generate
// Programming File of blinky for real (the device description and the bit database of the XC3S250E
// ship with Silinx: no ISE), the Processes icons and the Design Summary, the FPGA view of the routed
// design, the processes that need ISE disabled with a tooltip, the clear failure for a device the
// Silinx toolchain does not support, and the Portuguese texts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { DB_DIR } from '../../research/s3e-bitstream/db.mjs';

let env;
// the server's bit database: the shipped one, plus the (empty) pads of the XC3S250E in the TQ144
// package, whose device description does not ship (the case where Silinx offers to build it)
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-bitdb-'));
before(async () => {
  for (const f of fs.readdirSync(DB_DIR)) fs.copyFileSync(path.join(DB_DIR, f), path.join(dbDir, f));
  fs.writeFileSync(path.join(dbDir, 'xc3s250e-tq144-pads.json'), '{"padFeatures":{}}');
  process.env.SILINX_BIT_DB_DIR = dbDir;
  env = await setupUi();
});
after(async () => { await env?.teardown?.(); delete process.env.SILINX_BIT_DB_DIR; fs.rmSync(dbDir, { recursive: true, force: true }); });
const E = () => env;

const procLabels = (page) => page.eval(() => [...document.querySelectorAll('#procs .row')].map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled'), title: r.title })));
// the page's toolchain after a change through the API
const reloadToolchain = (page) => page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
const DONE = (name) => new RegExp(`Process "${name.replace(/[()]/g, '\\$&')}" (completed successfully|failed)`);

uiTest('a new installation starts in the Silinx toolchain: Implement Design and Generate Programming File need no ISE (#27)', E, async (page) => {
  await fs.promises.rm(path.join(env.server.configDir, 'config.json'));
  const tc = await env.server.api('GET', '/api/toolchain');
  assert.equal(tc.config.mode, 'silinx');
  assert.equal(tc.ise.available, true);
  await makeProject(env, { name: 'OpenDefault', template: 'blinky' });
  await page.openProject('OpenDefault');
  await reloadToolchain(page);
  const procs = await procLabels(page);
  assert.ok(procs.some((p) => p.label === 'Synthesize - Yosys' && !p.disabled));
  for (const l of ['Implement Design', 'Generate Programming File']) assert.ok(!procs.find((x) => x.label === l).disabled, l);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

uiTest('Toolchain Settings: the open mode, the status of the project\'s device, no ISE setting; Portuguese', E, async (page) => {
  // an ISE for device descriptions set before (#8 removed it from the interface): kept on Save
  await env.server.api('PUT', '/api/toolchain', { open: { iseMode: 'ssh' } });
  await makeProject(env, { name: 'OpenSet', template: 'blinky' });
  await page.openProject('OpenSet');
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  const modeSel = '.dlg-overlay .form-grid select';
  assert.equal(await page.eval((s) => [...document.querySelector(s).options].pop().textContent, modeSel), 'Silinx toolchain (experimental, no ISE)');
  // not in open mode: no open status
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .open-status').style.display), 'none');
  await page.eval((s) => { const m = document.querySelector(s); m.value = 'silinx'; m.dispatchEvent(new Event('change')); }, modeSel);
  const labels = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent));
  // the supported devices' descriptions ship with Silinx: no ISE in open mode (#8)
  assert.deepEqual(labels, ['Execution mode:', 'Programmer tool:', 'Cable:']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Save', 'Cancel']);
  const status = await page.eval(() => document.querySelector('.dlg-overlay .open-status').innerText);
  assert.match(status, /Silinx toolchain for xc3s250ecp132-4: available/);
  assert.match(status, /xc3s250ecp132-4: device description \(shipped with Silinx\) and bit database/);
  assert.doesNotMatch(status, /Build Device Description|xdl -report/);
  // Portuguese: the dialog in open mode has no untranslated text (server data apart)
  await page.eval(TEXTS);
  const tc = await env.server.api('GET', '/api/toolchain?project=OpenSet');
  const data = new Set([tc.ise.help, tc.ise.reason, 'impact', 'djtgcfg', 'adepttool', 'xc3sprog', 'openFPGALoader']);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  assert.deepEqual(untranslated(en, pt, [/^\(.*\)$/, { test: (s) => data.has(s) || /^Settings file:|^Ficheiro de definições:|^\/|not found$/.test(s) }]), []);
  assert.ok(pt.includes('Toolchain Silinx para xc3s250ecp132-4: disponível'), pt.join(' | '));
  await setLang('en');
  await page.dialogButton('Save');
  await page.waitNoDialog();
  await page.waitConsole(/Toolchain settings saved \(silinx: Silinx toolchain \(experimental, no ISE\)/);
  const cfg = (await env.server.api('GET', '/api/toolchain')).config;
  assert.equal(cfg.mode, 'silinx');
  assert.equal(cfg.open.iseMode, 'ssh');
  // the Processes follow at once: Synthesize is the open synthesis, the ISE-only ones are disabled
  const procs = await procLabels(page);
  assert.ok(procs.some((p) => p.label === 'Synthesize - Yosys' && !p.disabled));
  assert.ok(!procs.some((p) => p.label === 'Synthesize - Yosys (open)' || p.label === 'Synthesize - XST'));
  for (const l of ['Generate Post-Synthesis Simulation Model', 'Generate Post-Map Simulation Model', 'Generate Text Power Report']) {
    const p = procs.find((x) => x.label === l);
    assert.ok(p?.disabled, l);
    assert.equal(p.title, 'Needs Xilinx ISE: not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings)');
  }
  for (const l of ['Implement Design', 'Generate Programming File', 'View Implemented Design (FPGA)', 'Back-annotate Pin Locations', 'View Technology Schematic', 'Configure Target Device']) assert.ok(!procs.find((x) => x.label === l).disabled, l);
  await setLang('pt');
  const ptProcs = await procLabels(page);
  assert.ok(ptProcs.some((p) => p.label === 'Sintetizar - Yosys'));
  assert.ok(ptProcs.some((p) => p.title === 'Requer o Xilinx ISE: não disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain)'));
  await setLang('en');
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

uiTest('open mode: Generate Programming File of blinky without ISE; the Processes icons, the Design Summary, the FPGA view', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenImpl', template: 'blinky' });
  await page.openProject('OpenImpl');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(DONE('Generate Programming File'), { timeout: 120000 });
  const text = await page.consoleText();
  assert.match(text, /Process "Generate Programming File" completed successfully/, text.slice(-3000));
  assert.match(text, /Silinx implementation with the Silinx toolchain \(experimental, no ISE\)/);
  assert.match(text, /All signals are completely routed\./);
  assert.match(text, /Bitstream: build\/top\.bit \(\d+ bytes, every feature in the bit database\)/);
  const st = await page.eval(() => window.SilinxApp.S.status);
  for (const id of ['synth', 'translate', 'map', 'par', 'impl', 'bitgen']) assert.ok(['ok', 'warn'].includes(st[id]), `${id}: ${st[id]}`);
  // the Design Summary
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => [...document.querySelectorAll('.page')].some((p) => /Silinx toolchain, no ISE/.test(p.innerText)), [], { what: 'summary of the open run' });
  const sum = await page.eval(() => [...document.querySelectorAll('.page')].find((p) => /Silinx toolchain, no ISE/.test(p.innerText)).innerText);
  assert.match(sum, /Implementation State:\s*Programming File Generated/);
  assert.match(sum, /Device Utilization Summary \(Silinx toolchain\)/);
  assert.match(sum, /Number of occupied Slices\s+\d+\s+2448\s+\d+%/);
  assert.match(sum, /Number of bonded IOBs\s+15\s+92\s+16%/);
  assert.match(sum, /Timing \(post Place & Route, Silinx toolchain estimate\)/);
  assert.match(sum, /All constraints met/);
  assert.match(sum, /PERIOD 20 ns on clk/);
  assert.match(sum, /Bitstream\s+build\/top\.bit/);
  assert.match(sum, /Routed Design \(XDL\)\s+Current/);
  // what Program (iMPACT) uses
  const bi = await env.server.api('GET', '/api/projects/OpenImpl/bitinfo');
  assert.equal(bi.available, true);
  // View Implemented Design (FPGA): the routed design, no ISE
  await page.treeRow('#procs', 'View Implemented Design (FPGA)', { dbl: true, exact: true });
  await page.waitFor(() => window.SilinxApp.findDoc('fpgaview'), [], { what: 'FPGA view', timeout: 60000 });
  assert.equal(await page.eval(() => window.SilinxApp.S.active.title), 'FPGA (top)');
});

uiTest('open mode: a device without a bit database or without a shipped description fails clearly (no offer to build it, #8)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  const V = { 'src/top.v': 'module top(input a, output y);\n  assign y = ~a;\nendmodule\n' };
  await makeProject(env, { name: 'Open1600', template: 'empty', device: { family: 'spartan3e', part: 'xc3s1600e', package: 'fg320', speed: '-4' }, files: V, top: 'top' });
  await page.openProject('Open1600');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
  await page.waitConsole(DONE('Implement Design'), { timeout: 30000 });
  const text = await page.consoleText();
  // (the TQ144 is listed: this test's copy of the bit database has its (empty) pads, see above)
  assert.match(text, /ERROR: the Silinx toolchain cannot implement this design: no bit database for xc3s1600e yet \(only the XC3S100E \(CP132\), XC3S250E \(CP132, TQ144\), XC3S500E \(FG320\), XC3S1200E \(FG320\)\): use an ISE mode for this device\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.status.impl), 'err');
  // the same chip in another package (its pads in this test's bit database): no description ships; no dialog
  await makeProject(env, { name: 'OpenTq', template: 'empty', device: { family: 'spartan3e', part: 'xc3s250e', package: 'tq144', speed: '-4' },
    files: V, top: 'top' });
  await page.openProject('OpenTq');
  await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
  await page.waitConsole(/no device description of xc3s250etq144-4 ships with Silinx/, { timeout: 30000 });
  await page.waitConsole(DONE('Implement Design'));
  assert.match(await page.consoleText(), /ERROR: the Silinx toolchain cannot implement this design: no device description of xc3s250etq144-4 ships with Silinx \(the Silinx toolchain supports the XC3S100E \(CP132\), XC3S250E \(CP132, TQ144\), XC3S500E \(FG320\), XC3S1200E \(FG320\)\): use an ISE mode for this device\./);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

// Back-annotate Pin Locations in the Silinx toolchain (#118): blinky without a board, its UCF without the
// LOCs of four LEDs and a switch; the pads the placer chose are added to the UCF (after the preview);
// built again, nothing more to add
const BA_UCF = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../examples/blinky/constraints/top.ucf'), 'utf8')
  .split('\n').map((l) => (/"(led<[4-7]>|sw<3>)"/.test(l) ? l.replace(/LOC = "\w+" \| /, '') : l)).join('\n');
const BA_PINS = ['NET "led<4>" LOC = "H12";', 'NET "led<5>" LOC = "H13";', 'NET "led<6>" LOC = "J13";', 'NET "led<7>" LOC = "G13";', 'NET "sw<3>" LOC = "J14";'];
uiTest('open mode: Back-annotate Pin Locations writes the pins the placer chose into the UCF; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenPins', template: 'blinky', board: null, files: { 'constraints/top.ucf': BA_UCF } });
  await page.openProject('OpenPins');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  const proc = (await procLabels(page)).find((p) => p.label === 'Back-annotate Pin Locations');
  assert.deepEqual(proc, { label: 'Back-annotate Pin Locations', disabled: false, title: '' });
  await page.treeRow('#procs', 'Back-annotate Pin Locations', { dbl: true, exact: true });
  await page.waitDialog('Back-annotate Pin Locations', { timeout: 120000 });
  const msg = () => page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent);
  assert.equal(await msg(), `Add the 5 pin location(s) chosen by the tools to constraints/top.ucf?\n\n${BA_PINS.join('\n')}`);
  const text = await page.consoleText();
  assert.match(text, /=== SILINX STEP pin2ucf ===/);
  assert.match(text, /Pin locations of 15 port bit\(s\), 5 of them chosen by the placer \(no LOC in the constraints\): build\/top_pins\.ucf/);
  assert.deepEqual(text.split('\n').filter((l) => /warning/i.test(l)),
    ['WARNING:ConstraintSystem - "constraints/top.ucf" Line 22: 5 port bit(s) of \'top\' have no LOC: sw<3>, led<4>, led<5>, led<6>, led<7>',
      'WARNING: 5 port bit(s) have no LOC constraint (sw<3>, led<4>, led<5>, led<6>, led<7>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream',
      'Process "Back-annotate Pin Locations" completed successfully with 2 warning(s)']);
  // the constraints' warning: the process's own (after its Started line), counted with the others,
  // in the Warnings tab once; the process's icon a warning (#129)
  const run = text.slice(text.lastIndexOf('Started : "Back-annotate Pin Locations"'));
  assert.match(run, /^Started : "Back-annotate Pin Locations"\.\n+WARNING:ConstraintSystem - "constraints\/top\.ucf" Line 22: 5 port bit\(s\) of 'top' have no LOC/);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 2);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(2)');
  assert.equal(await page.eval(() => window.SilinxApp.S.status.pin2ucf), 'warn');
  // Portuguese
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await page.eval(TEXTS);
  await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  assert.deepEqual(untranslated(en, pt), []);
  assert.equal(await msg(), `Adicionar a constraints/top.ucf as 5 localizações de pinos escolhidas pelas ferramentas?\n\n${BA_PINS.join('\n')}`);
  await setLang('en');
  await page.dialogButton('Yes');
  await page.waitConsole(/Back-annotated 5 pin location\(s\) into constraints\/top\.ucf\./);
  const ucf = await env.server.api('GET', '/api/projects/OpenPins/file?path=constraints%2Ftop.ucf');
  assert.equal(ucf, `${BA_UCF.replace(/\s*$/, '\n')}\n# Back-annotated pin locations (Silinx toolchain, ${new Date().toISOString().slice(0, 10)})\n${BA_PINS.join('\n')}\n`);
  // again: built from the back-annotated UCF (no warning about pins), nothing more to add
  await page.treeRow('#procs', 'Back-annotate Pin Locations', { dbl: true, exact: true });
  await page.waitConsole(/every port already has a LOC in the UCF \(nothing to add\)\./, { timeout: 120000 });
  const again = (await page.consoleText()).split('Back-annotated 5 pin location(s)').pop();
  assert.match(again, /Process "Back-annotate Pin Locations" completed successfully\n/);
  assert.deepEqual(again.split('\n').filter((l) => /warning/i.test(l)), []);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 240000 });

// the constraints' warnings found before a run (Check Constraints): the process's own, counted in its
// "completed successfully with N warning(s)", its icon a warning; a run without Translate: on
// Synthesize's icon (#129)
uiTest('open mode: Synthesize counts the constraints\' warnings printed before it runs (#129)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenUcfWarn', template: 'blinky', board: null, files: { 'constraints/top.ucf': BA_UCF } });
  await page.openProject('OpenUcfWarn');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Synthesize - Yosys', { dbl: true, exact: true });
  await page.waitConsole(DONE('Synthesize - Yosys'), { timeout: 120000 });
  const text = await page.consoleText();
  const run = text.slice(text.lastIndexOf('Started : "Synthesize - Yosys"'));
  assert.deepEqual(run.split('\n').filter((l) => /warning/i.test(l)),
    ['WARNING:ConstraintSystem - "constraints/top.ucf" Line 22: 5 port bit(s) of \'top\' have no LOC: sw<3>, led<4>, led<5>, led<6>, led<7>',
      'WARNING: 5 port bit(s) have no LOC constraint (sw<3>, led<4>, led<5>, led<6>, led<7>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream',
      'Process "Synthesize - Yosys" completed successfully with 2 warning(s)']);
  assert.equal(text.split('\n').filter((l) => /warning/i.test(l)).length, 3, 'printed once');
  assert.equal(await page.eval(() => window.SilinxApp.S.status.synth), 'warn');
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 2);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(2)');
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 180000 });

// View Technology Schematic in the Silinx toolchain (#119): the netlist of its synthesis (Synthesize runs
// first), drawn by Silinx's schematic engine: blocks by instance, primitives inside, a LUT's function
const TECH = '.doc:not([hidden])';
const techView = (page) => page.eval(() => {
  const ed = window.Silinx.active?.viewer;
  return ed ? { id: window.Silinx.active.id, title: window.Silinx.active.title, crumbs: document.querySelector('.doc:not([hidden]) .rtl-crumbs').innerText.replace(/\s+/g, ' '),
    syms: ed.getDoc().symbols.map((x) => ({ id: x.id, type: x.type, name: x.name, module: x.params?.module || null, generics: x.params?.generics || null })) } : null;
});
async function checkTechSchematic(page, { top, blocks, message, inside }) {
  await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
  await page.waitFor((t) => window.Silinx.active?.id === `tech:${t}` && window.Silinx.active.viewer?.getDoc().symbols.length > 10, [top], { what: 'technology schematic', timeout: 180000 });
  const log = await page.consoleText();
  assert.match(log, /Process "Synthesize - Yosys" completed successfully/);
  assert.ok(log.includes(message), log.slice(-1500));
  let v = await techView(page);
  assert.equal(v.title, `${top} (Technology)`);
  assert.ok(v.crumbs.includes(`Technology Schematic (read-only): the post-synthesis netlist — ${top} : ${top}`), v.crumbs);
  assert.equal(await page.eval(() => window.Silinx.status.tech), 'ok');
  const mods = new Set(v.syms.map((x) => x.module));
  for (const m of ['ibuf', 'obuf', 'bufg', ...blocks.map((b) => b.toLowerCase())]) assert.ok(mods.has(m), `${m} on the top level: ${[...mods].join(' ')}`);
  // push into an instance: its LUTs, flip-flops, carry chain
  const blk = v.syms.find((x) => x.module === inside.toLowerCase());
  await page.dblclick(`${TECH} .se-svg [data-kind=sym][data-id="${blk.id}"]`);
  await page.waitFor((b) => document.querySelector('.doc:not([hidden]) .rtl-crumbs b')?.textContent === `${b} : ${b}`, [inside.toLowerCase()], { what: `inside ${inside}`, timeout: 60000 });
  await page.waitFor((n) => window.Silinx.active.viewer.getDoc().symbols.length > 5 && !window.Silinx.active.viewer.getDoc().symbols.some((x) => x.params?.module === n), [inside.toLowerCase()]);
  v = await techView(page);
  const types = new Set(v.syms.map((x) => x.module));
  for (const t of ['fdre', 'muxcy', 'xorcy']) assert.ok(types.has(t), `${t} in ${inside}: ${[...types].join(' ')}`);
  // a LUT: its function from its INIT, on demand (a collapsed section of its properties)
  const lut = v.syms.find((x) => x.module === 'lut4');
  await page.click(`${TECH} .se-svg [data-kind=sym][data-id="${lut.id}"]`);
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-lutfn'), [], { what: 'LUT function' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-lutfn').open), false);
  await page.click(`${TECH} .se-lutfn > summary`);
  const fn = await page.eval(async (init) => (await import('/core/fpga/techview.js')).lutFunction(init, 4), lut.generics.init);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-lut-eq').textContent), fn.equation);
  assert.match(fn.equation, /^O = /);
  assert.equal(await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .se-lut-tt tr').length), 17);
  return v;
}

uiTest('open mode: View Technology Schematic of blinky and pong without ISE: the Silinx toolchain\'s netlist by instance, a LUT\'s function; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenTech', template: 'blinky' });
  await page.openProject('OpenTech');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  assert.deepEqual((await procLabels(page)).find((p) => p.label === 'View Technology Schematic'), { label: 'View Technology Schematic', disabled: false, title: '' });
  await checkTechSchematic(page, { top: 'top', blocks: ['u_pre', 'u_speed', 'u_knight'], inside: 'u_pre',
    message: "Technology Schematic of 'top': the netlist of the Silinx toolchain's synthesis (build/open/top.json), 367 cells in 3 block(s): u_knight (50), u_speed (215), u_pre (70)." });
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /warning|error/i.test(l)), []);
  // Portuguese: the view's bar, its tab and the LUT's function have no untranslated text (the netlist's names apart)
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval(() => ['.doc:not([hidden]) .rtl-crumbs', '.doc:not([hidden]) .se-lutfn', '#doc-tabs .tab.active'].flatMap((q) => (document.querySelector(q) ? window.__uiTexts(document.querySelector(q)) : [])));
  await setLang('en'); const en = await texts();
  await setLang('pt'); const pt = await texts();
  assert.deepEqual(untranslated(en, pt, [/^\w+ : \w+$/, /^\w+$/]), []);
  assert.ok(pt.includes('Esquemático Tecnológico (só de leitura): a netlist pós-síntese'), pt.join(' | '));
  assert.ok(pt.includes('Função do LUT (INIT)'), pt.join(' | '));
  await setLang('en');
  // pong: the instances of the design, and the logic of its top module by signal (blocks *_logic)
  await makeProject(env, { name: 'OpenTechPong', template: 'pong' });
  await page.openProject('OpenTechPong');
  await page.click('input[name=view][value=impl]');
  await checkTechSchematic(page, { top: 'pong', blocks: ['display', 'dbL', 'dbR', 'db1', 'db2', 'timer_logic'], inside: 'dbL',
    message: "Technology Schematic of 'pong': the netlist of the Silinx toolchain's synthesis (build/open/pong.json), 1068 cells in 20 block(s): " });
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 400000 });

// The read-only schematic views in Portuguese (#130): the RTL and Technology Schematics' bar, symbol
// palette (hidden in these views: its category options and symbol tooltips), the properties of one
// object of each kind (nothing selected, every symbol type, an I/O marker, a wire, a net name), all
// objects selected, the status bar and the Check panel: no English text left (names apart)
async function viewerTexts(page) {
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const both = async () => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
    await setLang('en');
    return { en, pt };
  };
  // where to click one object of each kind (a wire: the middle of its line)
  const targets = await page.eval(() => {
    const d = window.Silinx.active.viewer.getDoc();
    const out = [], seen = new Set();
    for (const g of document.querySelectorAll('.doc:not([hidden]) .se-svg [data-kind]')) {
      const kind = g.dataset.kind === 'sym' ? `sym:${d.symbols.find((s) => s.id === g.dataset.id)?.type}` : g.dataset.kind;
      if (seen.has(kind)) continue;
      const pl = g.querySelector('polyline');
      let x, y;
      if (pl) { const q = pl.getPointAtLength(pl.getTotalLength() / 2), m = pl.getScreenCTM(); x = q.x * m.a + q.y * m.c + m.e; y = q.x * m.b + q.y * m.d + m.f; } else { const b = g.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
      if (document.elementFromPoint(x, y)?.closest('[data-kind]') !== g) continue;
      seen.add(kind); out.push({ kind, x, y });
    }
    return out;
  });
  const runs = [await both()];
  const kinds = [];
  for (const t of targets) {
    await page.click({ x: t.x, y: t.y });
    kinds.push(t.kind);
    runs.push(await both());
  }
  // all objects selected (Ctrl+A)
  await page.click('.doc:not([hidden]) .se-toolbar [data-act=fit]');
  await page.key('a', { modifiers: 2 });
  await page.waitFor(() => / objects selected$/.test(document.querySelector('.doc:not([hidden]) .se-ptitle')?.textContent || ''), [], { what: 'all selected' });
  runs.push(await both());
  // the Check panel
  await page.click('.doc:not([hidden]) .se-toolbar [data-act=check]');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .se-diags').hidden, [], { what: 'Check panel' });
  runs.push(await both());
  return { kinds, untranslated: [...new Set(runs.flatMap((r) => untranslated(r.en, r.pt, [/^\w+ : \w+$/, /^Flip-Flops$/, /^@Buffer$/])))], pt: new Set(runs.flatMap((r) => r.pt)), en: new Set(runs.flatMap((r) => r.en)) };
}

uiTest('RTL and Technology Schematic in Portuguese: the palette, its tooltips, the properties, the status bar are translated (#130)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'ViewPt', template: 'blinky' });
  await page.openProject('ViewPt');
  await reloadToolchain(page);
  await page.eval(TEXTS);
  // RTL Schematic of blinky's top
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'rtl:top' && document.querySelectorAll('.doc:not([hidden]) .se-svg [data-kind=sym]').length >= 5, [], { what: 'RTL schematic' });
  const rtl = await viewerTexts(page);
  assert.deepEqual(rtl.kinds, ['wire', 'sym:module', 'sym:slice', 'sym:and2b1', 'sym:hdlblock', 'port', 'label']);
  assert.deepEqual(rtl.untranslated, []);
  for (const s of ['Propriedades', '<--Todos os Símbolos-->', '@Inversor', '@Porta AND de 2 entradas (bit a bit quando Largura > 1)', 'Abrir top.vhd', 'Fio · rede clk', "Rede 'clk', 1 bit",
    'Módulo prescaler', 'Parâmetros', 'vazio = valor por omissão do módulo', 'Pinos (3)', 'Índice do MSB', 'Marcador de E/S', 'Bidirecional', 'Nome de Rede',
    'um por linha: nome[largura] (acrescente "clock" para um pino de relógio)', 'nome[largura]', 'Verificar Esquemático: 0 erro(s), 0 aviso(s)', 'Nenhum erro ou aviso encontrado.'])
    assert.ok(rtl.pt.has(s), `${s}: ${[...rtl.pt].join(' | ')}`);
  // texts starting with a number (which the language check takes for numbers) are translated too
  assert.ok([...rtl.pt].some((s) => /^\d+ objetos selecionados$/.test(s)), [...rtl.pt].join(' | '));
  assert.ok([...rtl.pt].some((s) => /^\d+ símbolos, \d+ redes · 0 erro\(s\), 0 aviso\(s\)$/.test(s)), [...rtl.pt].join(' | '));
  // Technology Schematic of the same design (the Silinx toolchain's synthesis)
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'tech:top' && window.Silinx.active.viewer?.getDoc().symbols.length > 10, [], { what: 'technology schematic', timeout: 180000 });
  const tech = await viewerTexts(page);
  assert.deepEqual(tech.kinds, ['wire', 'sym:module', 'sym:constant', 'sym:slice', 'sym:busjoin', 'port', 'label']);
  assert.deepEqual(tech.untranslated, []);
  for (const s of ['Propriedades', 'Esquemático Tecnológico (só de leitura): a netlist pós-síntese', 'Módulo lut2', 'Pinos (3)', 'Larguras das entradas (MSB primeiro)', 'Função do LUT (INIT)'])
    assert.ok(tech.pt.has(s), `${s}: ${[...tech.pt].join(' | ')}`);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /warning|error/i.test(l)), []);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 300000 });
