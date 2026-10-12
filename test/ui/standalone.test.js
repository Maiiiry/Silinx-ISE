// UI: the standalone single-file edition (scripts/build-standalone.mjs -> Silinx-ISE.html, built
// here into a temp directory): it loads from file:// without a server, creates a project from an
// example and simulates it; the site (--site: the page and the assets of the Silinx toolchain, as
// GitHub Pages publishes it), served over HTTP, implements blinky in the browser down to the bitstream.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setupUi, uiTest, waitDownload, ROOT } from './harness.js';

let env, html, site, server, siteUrl, skip = null;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  // the build script writes <its root>/dist: give it a root of its own (links to web, core, server,
  // examples and the installed packages) so that the repository's dist/ is not touched
  const require = createRequire(path.join(ROOT, 'package.json'));
  let modules;
  try {
    modules = path.dirname(path.dirname(require.resolve('codemirror/package.json')));
    require.resolve('esbuild');
    require.resolve('elkjs/package.json');
  } catch { skip = 'esbuild / codemirror / elkjs not installed (npm install): standalone build test skipped'; return; }
  const root = path.join(env.tmp, 'standalone');
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'scripts/build-standalone.mjs'), path.join(root, 'scripts/build-standalone.mjs'));
  for (const d of ['web', 'core', 'server', 'examples', 'research']) await fs.symlink(path.join(ROOT, d), path.join(root, d), 'dir');
  for (const f of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) await fs.copyFile(path.join(ROOT, f), path.join(root, f));   // the embedded notices
  await fs.symlink(modules, path.join(root, 'node_modules'), 'dir');
  site = path.join(root, 'site');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/build-standalone.mjs'), '--site', site], { cwd: root, encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) throw new Error(`standalone build failed: ${r.stderr || r.stdout}`);
  html = path.join(root, 'dist', 'Silinx-ISE.html');
  // the site over HTTP, as GitHub Pages serves it (no Content-Encoding: the .json.gz are fetched as bytes)
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
  server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(site, rel);
    if (!f.startsWith(site + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(f);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  siteUrl = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { server?.close(); await env?.teardown?.(); });
const E = () => (skip ? { skip } : env);

uiTest('standalone edition (dist build): loads from file://, creates a project from an example, simulates it', E, async (page) => {
  const stat = await fs.stat(html);
  assert.ok(stat.size > 500_000, `single file of ${stat.size} bytes`);
  const text = await fs.readFile(html, 'utf8');
  assert.doesNotMatch(text, /<script[^>]+src=/, 'no external scripts');
  assert.doesNotMatch(text, /<link[^>]+stylesheet/, 'no external stylesheets');
  await page.goto(pathToFileURL(html).href);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'standalone boot' });
  assert.match(await page.eval(() => document.title), /Silinx ISE .*Project Navigator/);
  await page.waitConsole(/Browser edition: projects are stored in this browser/);
  // File menu: the bundle commands of the standalone edition
  const file = (await page.openMenu('File')).map((i) => i.label);
  assert.ok(file.includes('Open Project Bundle…') && file.includes('Download Project Bundle…'), file.join(' | '));
  await page.closeMenus();
  // New Project wizard from the embedded blinky example
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Solo');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Solo' && [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'u_knight - knight'));
  // the project lives in localStorage
  assert.ok(await page.eval(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes('"Solo"'))));
  // behavioural simulation of the test bench in the ISim view
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && /Sim Time: 1,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || ''), [], { what: 'simulation ran', timeout: 30000 });
  assert.ok(await page.eval(() => window.Silinx.active.view.state.rows.find((r) => r.name === 'clk').sig.wave.t.length) > 50);
  // a project that synthesizes with XST needs Xilinx ISE: a clear message, no crash
  await page.eval(async () => { window.Silinx.project.synthTool = 'xst'; await window.SilinxApp.saveProjectJson(); });
  await page.click('input[name=view][value=impl]');
  await page.menu('Process', 'Implement Top Module');
  await page.waitConsole(/This project synthesizes with XST, which needs Xilinx ISE 14\.7: not available in the browser edition\./, { timeout: 15000 });
  await page.waitFor(() => !window.Silinx.busy);
  await page.eval(async () => { window.Silinx.project.synthTool = 'silinx'; await window.SilinxApp.saveProjectJson(); });
  // edits are kept across a reload (localStorage)
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const cm = window.Silinx.active.editor.cm; cm.focus(); cm.setCursor({ line: 0, ch: 0 }); cm.replaceSelection('-- kept in the browser\n'); });
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'));
  await page.goto(pathToFileURL(html).href);
  await page.waitFor(() => window.Silinx?.project?.name === 'Solo', [], { what: 'reopened after reload' });
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor && window.Silinx.active.editor.getValue().startsWith('-- kept in the browser\n'));
  // live schematic simulation without a server: knight converted to a schematic (linked to knight.vhd)
  await page.treeRow('#hier', 'u_knight - knight', { right: true });
  await page.click('body > .menu-popup .mi', { text: 'Convert to Schematic (editable)…' });
  const ED = '.doc:not([hidden]) .sch-editor';
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/knight.sch.json' && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED], { what: 'converted schematic open' });
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'standalone live simulation' });
  const leds = () => page.eval(() => { const ed = window.Silinx.active.schEditor, p = ed.getDoc().ports.find((q) => q.name === 'leds'); return ed.liveSim.portValue(p.id).v.toString(2); });
  assert.equal(await leds(), '1');
  const stepId = await page.eval(() => window.Silinx.active.schEditor.getDoc().ports.find((q) => q.name === 'step').id);
  await page.click(`${ED} .lv-ctl[data-port="${stepId}"]`);
  await page.click(`${ED} .se-simbar .lv-step`);
  assert.equal(await leds(), '10', 'one LED step after a clock cycle with step = 1');
}, { url: () => 'about:blank' });

uiTest('browser edition (the site over HTTP): Generate Programming File runs the Silinx toolchain in the browser', E, async (page) => {
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Web');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Web' && window.Silinx.project.top);
  assert.ok(await page.eval(() => window.SilinxApp.openMode()), 'the browser edition synthesizes with Silinx');
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/=== SILINX DONE ===/, { timeout: 120000 });
  await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
  const log = await page.consoleText();
  for (const re of [/=== SILINX STEP synth ===/, /=== SILINX STEP par ===/, /=== SILINX STEP bitgen ===/, /Bitstream: build\/top\.bit/, /Bitstream downloaded: top\.bit/])
    assert.match(log, re);
  assert.doesNotMatch(log, /SILINX FAILED|Process failed/);
  // the bitstream is downloaded
  const { size } = await fs.stat(await waitDownload(page, 'top.bit'));
  assert.ok(size > 100_000, `top.bit downloaded (${size} bytes)`);
}, { url: () => 'about:blank', timeout: 240000 });
