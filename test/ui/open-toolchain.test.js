// UI: the toolchain mode "Open toolchain (experimental, no ISE)": chosen in Toolchain Settings (with
// the status of the project's device; no ISE setting nor Build Device Description, #8), Generate
// Programming File of blinky for real (the device description and the bit database of the XC3S250E
// ship with Silinx: no ISE), the Processes icons and the Design Summary, the FPGA view of the routed
// design, the processes that need ISE disabled with a tooltip, the clear failure for a device the
// open toolchain does not support, and the Portuguese texts.
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

uiTest('Toolchain Settings: the open mode, the status of the project\'s device, no ISE setting; Portuguese', E, async (page) => {
  // an ISE for device descriptions set before (#8 removed it from the interface): kept on Save
  await env.server.api('PUT', '/api/toolchain', { open: { iseMode: 'ssh' } });
  await makeProject(env, { name: 'OpenSet', template: 'blinky' });
  await page.openProject('OpenSet');
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  const modeSel = '.dlg-overlay .form-grid select';
  assert.equal(await page.eval((s) => [...document.querySelector(s).options].pop().textContent, modeSel), 'Open toolchain (experimental, no ISE)');
  // not in open mode: no open status
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .open-status').style.display), 'none');
  await page.eval((s) => { const m = document.querySelector(s); m.value = 'open'; m.dispatchEvent(new Event('change')); }, modeSel);
  const labels = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent));
  // the supported devices' descriptions ship with Silinx: no ISE in open mode (#8)
  assert.deepEqual(labels, ['Execution mode:', 'Programmer tool:', 'Cable:']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Save', 'Cancel']);
  const status = await page.eval(() => document.querySelector('.dlg-overlay .open-status').innerText);
  assert.match(status, /Open toolchain for xc3s250ecp132-4: available/);
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
  assert.ok(pt.includes('Toolchain aberta para xc3s250ecp132-4: disponível'), pt.join(' | '));
  await setLang('en');
  await page.dialogButton('Save');
  await page.waitNoDialog();
  await page.waitConsole(/Toolchain settings saved \(open: open toolchain \(experimental, no ISE\)/);
  const cfg = (await env.server.api('GET', '/api/toolchain')).config;
  assert.equal(cfg.mode, 'open');
  assert.equal(cfg.open.iseMode, 'ssh');
  // the Processes follow at once: Synthesize is the open synthesis, the ISE-only ones are disabled
  const procs = await procLabels(page);
  assert.ok(procs.some((p) => p.label === 'Synthesize - Yosys' && !p.disabled));
  assert.ok(!procs.some((p) => p.label === 'Synthesize - Yosys (open)' || p.label === 'Synthesize - XST'));
  for (const l of ['Generate Post-Synthesis Simulation Model', 'Generate Post-Map Simulation Model', 'Generate Text Power Report', 'Back-annotate Pin Locations', 'View Technology Schematic']) {
    const p = procs.find((x) => x.label === l);
    assert.ok(p?.disabled, l);
    assert.equal(p.title, 'Needs Xilinx ISE: not available with the open toolchain (choose an ISE mode in Toolchain Settings)');
  }
  for (const l of ['Implement Design', 'Generate Programming File', 'View Implemented Design (FPGA)', 'Configure Target Device']) assert.ok(!procs.find((x) => x.label === l).disabled, l);
  await setLang('pt');
  const ptProcs = await procLabels(page);
  assert.ok(ptProcs.some((p) => p.label === 'Sintetizar - Yosys'));
  assert.ok(ptProcs.some((p) => p.title === 'Requer o Xilinx ISE: não disponível com a toolchain aberta (escolha um modo ISE nas Definições da Toolchain)'));
  await setLang('en');
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

uiTest('open mode: Generate Programming File of blinky without ISE; the Processes icons, the Design Summary, the FPGA view', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'open' });
  await makeProject(env, { name: 'OpenImpl', template: 'blinky' });
  await page.openProject('OpenImpl');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(DONE('Generate Programming File'), { timeout: 120000 });
  const text = await page.consoleText();
  assert.match(text, /Process "Generate Programming File" completed successfully/, text.slice(-3000));
  assert.match(text, /Silinx implementation with the open toolchain \(experimental, no ISE\)/);
  assert.match(text, /All signals are completely routed\./);
  assert.match(text, /Bitstream: build\/top\.bit \(\d+ bytes, every feature in the bit database\)/);
  const st = await page.eval(() => window.SilinxApp.S.status);
  for (const id of ['synth', 'translate', 'map', 'par', 'impl', 'bitgen']) assert.ok(['ok', 'warn'].includes(st[id]), `${id}: ${st[id]}`);
  // the Design Summary
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => [...document.querySelectorAll('.page')].some((p) => /open toolchain, no ISE/.test(p.innerText)), [], { what: 'summary of the open run' });
  const sum = await page.eval(() => [...document.querySelectorAll('.page')].find((p) => /open toolchain, no ISE/.test(p.innerText)).innerText);
  assert.match(sum, /Implementation State:\s*Programming File Generated/);
  assert.match(sum, /Device Utilization Summary \(open toolchain\)/);
  assert.match(sum, /Number of occupied Slices\s+\d+\s+2448\s+\d+%/);
  assert.match(sum, /Number of bonded IOBs\s+15\s+92\s+16%/);
  assert.match(sum, /Timing \(post Place & Route, open toolchain estimate\)/);
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
  await env.server.api('PUT', '/api/toolchain', { mode: 'open' });
  const V = { 'src/top.v': 'module top(input a, output y);\n  assign y = ~a;\nendmodule\n' };
  await makeProject(env, { name: 'Open1600', template: 'empty', device: { family: 'spartan3e', part: 'xc3s1600e', package: 'fg320', speed: '-4' }, files: V, top: 'top' });
  await page.openProject('Open1600');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
  await page.waitConsole(DONE('Implement Design'), { timeout: 30000 });
  const text = await page.consoleText();
  // (the TQ144 is listed: this test's copy of the bit database has its (empty) pads, see above)
  assert.match(text, /ERROR: the open toolchain cannot implement this design: no bit database for xc3s1600e yet \(only the XC3S100E \(CP132\), XC3S250E \(CP132, TQ144\), XC3S500E \(FG320\), XC3S1200E \(FG320\)\): use an ISE mode for this device\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.status.impl), 'err');
  // the same chip in another package (its pads in this test's bit database): no description ships; no dialog
  await makeProject(env, { name: 'OpenTq', template: 'empty', device: { family: 'spartan3e', part: 'xc3s250e', package: 'tq144', speed: '-4' },
    files: V, top: 'top' });
  await page.openProject('OpenTq');
  await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
  await page.waitConsole(/no device description of xc3s250etq144-4 ships with Silinx/, { timeout: 30000 });
  await page.waitConsole(DONE('Implement Design'));
  assert.match(await page.consoleText(), /ERROR: the open toolchain cannot implement this design: no device description of xc3s250etq144-4 ships with Silinx \(the open toolchain supports the XC3S100E \(CP132\), XC3S250E \(CP132, TQ144\), XC3S500E \(FG320\), XC3S1200E \(FG320\)\): use an ISE mode for this device\./);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});
