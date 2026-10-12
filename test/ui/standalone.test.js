// UI: the standalone single-file edition (scripts/build-standalone.mjs -> Silinx-ISE.html, built
// here into a temp directory): it loads from file:// without a server, creates a project from an
// example and simulates it; the site (--site: the page and the assets of the Silinx toolchain, as
// GitHub Pages publishes it), served over HTTP, implements blinky in the browser down to the bitstream and programs it into a
// (simulated) Basys2 over WebUSB; it keeps the projects in a folder on the disk (File System Access
// API, through a fake folder) or, without that API, in the browser's storage.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setupUi, uiTest, waitDownload, ROOT, chromeOnly } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

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
    // (the simulated Digilent board of the programming test, the fake folder of the workspace folder tests)
    const TEST = { '__test/adept-sim.js': 'adept-sim.js', '__test/fs-access-fake.js': 'fs-access-fake.js' };
    const f = TEST[rel] ? path.join(ROOT, 'test/fixtures', TEST[rel]) : path.join(site, rel);
    if (!f.startsWith(site + path.sep) && !rel.startsWith('__test/')) { res.writeHead(403).end(); return; }
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
  // where the project goes: this browser's storage, not the full application's workspace folder (#125)
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main .hint:last-child').textContent), /^Projects are kept in this browser's storage \(/);
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
  // programming with no bitstream yet: the reason at the end of the failure line; no "install
  // openFPGALoader…" at startup
  assert.doesNotMatch(await page.consoleText(), /Programmers found/);
  await page.eval(() => window.SilinxApp.openImpact());
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: no bitstream build\/top\.bit in this browser: run Generate Programming File first, or choose a \.bit file/);
  assert.doesNotMatch(await page.consoleText(), /see log/);
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
  const bitFile = await waitDownload(page, 'top.bit');
  const bit = await fs.readFile(bitFile);
  assert.ok(bit.length > 100_000, `top.bit downloaded (${bit.length} bytes)`);

  // Configure Target Device: Program FPGA over WebUSB. Without WebUSB (Firefox, Safari, a file): why not
  await page.eval(() => Object.defineProperty(navigator, 'usb', { value: undefined, configurable: true }));
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => /WebUSB/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'iMPACT, browser edition' });
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: programming from the browser needs Chrome or Edge \(WebUSB\)/);
  // a Basys2 (simulated: its Adept USB firmware and JTAG chain) plugged in
  await page.eval(async (url) => {
    const { SimAdeptBoard, simUsb } = await import(url);
    window.__board = new SimAdeptBoard({ fpga: 'xc3s250e', prom: 'xcf02s' });
    Object.defineProperty(navigator, 'usb', { value: simUsb(window.__board), configurable: true });
  }, `${siteUrl}__test/adept-sim.js`);
  await page.click('.doc:not([hidden]) .btn', { text: 'Initialize Chain (Scan)' });
  await page.waitConsole(/Scan finished\./);
  const log2 = await page.consoleText();
  assert.match(log2, /Position 1: XC3S250E \(IDCODE 0x11c1a093\)\s+Position 2: XCF02S \(IDCODE 0xd5045093\)/);
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/'1': Programmed successfully\./, { timeout: 60000 });
  assert.match(await page.consoleText(), /JTAG chain: XC3S250E → XCF02S\s+JPROGRAM: clearing the configuration\s+CFG_IN: \d+ bytes\s+JSTART\s+DONE: the FPGA is configured/);
  // the FPGA took the downloaded bitstream, from its sync word
  assert.ok(await page.eval(() => window.__board.done));
  const sync = bit.indexOf(Buffer.from([0xaa, 0x99, 0x55, 0x66]));
  assert.ok(sync > 0);
  assert.equal(await page.eval(() => btoa(String.fromCharCode(...window.__board.config.subarray(0, 4096))) + window.__board.config.length),
    bit.subarray(sync, sync + 4096).toString('base64') + (bit.length - sync));
  // a .bit chosen from the disk (Choose .bit…), into another board (a Nexys2-500 would refuse it)
  await page.eval(async (url) => {
    const { SimAdeptBoard, simUsb } = await import(url);
    window.__board = Object.assign(new SimAdeptBoard({ fpga: 'xc3s500e', prom: 'xcf04s', product: 'Nexys2' }), { granted: true });
    Object.defineProperty(navigator, 'usb', { value: simUsb(window.__board), configurable: true });
  }, `${siteUrl}__test/adept-sim.js`);
  await page.setFiles('.doc:not([hidden]) input[type=file][accept=".bit"]', [bitFile]);
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) input[type=text]')].some((i) => i.value === 'top.bit'), [], { what: 'top.bit chosen' });
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: the board's FPGA is a XC3S500E, the bitstream is for a XC3S250E/);
  assert.equal(await page.eval(() => window.__board.done), false);
}, { url: () => 'about:blank', timeout: 240000 });

// ---- projects in a folder on the disk (File System Access API, Chrome / Edge). The real folder
// picker cannot be driven headless: the page gets a fake one (test/fixtures/fs-access-fake.js),
// its folder kept in localStorage across reloads, and the folder's handle "remembered" through
// window.SILINX_WORKSPACE_HANDLES (a fake handle cannot be stored in IndexedDB).
const FAKE_FOLDER = (url) => `(() => {
  const fake = () => import(${JSON.stringify(url)});
  const open = async () => (window.__fakeRoot = (await fake()).fakeDirectory('Silinx-projects',
    { storage: localStorage, key: '__fakefs', permission: localStorage.getItem('__fakefs.permission') || 'granted' }));
  window.showDirectoryPicker = async (opts) => { window.__picker = opts; return open(); };
  window.SILINX_WORKSPACE_HANDLES = {
    load: async () => (localStorage.getItem('__fakefs.remembered') ? open() : null),
    save: async (h) => { localStorage.setItem('__fakefs.remembered', h.name); },
  };
})();`;
const NO_FOLDER_API = 'Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true, writable: true });';
const startEntries = (page) => page.eval(() => [...document.querySelectorAll('#start-page .start-storage .entry')]
  .map((e) => ({ text: e.textContent.trim(), link: !!e.querySelector('a'), title: e.title || '' })));
const statusStorage = (page) => page.eval(() => document.getElementById('status-storage').textContent);
const fileMenu = async (page) => {
  await page.openMenu('File');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')]
    .map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled'), title: r.title || '' })));
  await page.closeMenus();
  return items.filter((i) => /Workspace Folder|Reopen|Browser Storage|Browser Projects/.test(i.label));
};
const newProject = async (page, name, template) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
};
const UNSUPPORTED = 'This browser cannot give a page a folder on the disk (File System Access API: Chrome or Edge); the projects are kept in the browser\'s storage';

uiTest('browser edition: File ▸ Open Workspace Folder… keeps the projects in a folder on the disk, in the full application\'s format', E, async (page) => {
  const fakeUrl = `${siteUrl}__test/fs-access-fake.js`;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_FOLDER(fakeUrl) });
  const boot = async () => {
    await page.goto(siteUrl);
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices && document.getElementById('status-storage').textContent
      && document.querySelector('#start-page .start-storage, #hier .lbl'), [], { what: 'site boot' });
  };
  const files = () => page.eval(async (url) => (await import(url)).dump(window.__fakeRoot), fakeUrl);
  await boot();
  await page.waitConsole(/Browser edition: projects are stored in this browser \(File > Download Project Bundle to keep a copy; File > Open Workspace Folder… keeps them in a folder on the disk\)\. Implement Design/);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  assert.deepEqual(await fileMenu(page), [{ label: 'Open Workspace Folder…', disabled: false, title: '' }]);
  assert.deepEqual(await startEntries(page), [
    { text: 'In this browser\'s storage.', link: false, title: '' },
    { text: 'Open Workspace Folder…', link: true, title: '' },
  ]);
  // a project in the browser's storage, then the folder
  await newProject(page, 'InBrowser', 'blinky');
  await page.menu('File', 'Open Workspace Folder…');
  await page.waitConsole(/Projects are now kept in the folder 'Silinx-projects' on the disk: each project is a folder in the format of the full Silinx application\./);
  assert.deepEqual(await page.eval(() => window.__picker), { id: 'silinx-workspace', mode: 'readwrite' });
  assert.equal(await page.eval(() => window.Silinx.project), null, 'the browser storage\'s project is closed');
  assert.equal(await statusStorage(page), 'Storage: folder Silinx-projects');
  // the New Project wizard names the folder (#125)
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .wiz-main .form-grid input[disabled]').value, document.querySelector('.dlg-overlay .wiz-main .hint:last-child').textContent]),
    ['Silinx-projects/…', 'Projects are kept in the folder Silinx-projects on the disk (File ▸ Open Workspace Folder… to change it).']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await fileMenu(page), [{ label: 'Open Workspace Folder…', disabled: false, title: '' },
    { label: 'Copy Browser Projects to the Folder', disabled: false, title: '' }, { label: 'Use Browser Storage', disabled: false, title: '' }]);
  await page.waitFor(() => /In the folder/.test(document.querySelector('#start-page .start-storage')?.textContent || ''));
  assert.deepEqual((await startEntries(page)).map((e) => e.text), ['In the folder Silinx-projects on the disk.', 'Open Workspace Folder…', 'Copy Browser Projects to the Folder', 'Use Browser Storage']);
  // a project created and edited in the folder: a project folder as the full application's
  await newProject(page, 'Disk', 'stopwatch');
  await page.eval(() => window.SilinxApp.openFile('src/stopwatch.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/stopwatch.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const cm = window.Silinx.active.editor.cm; cm.focus(); cm.setCursor({ line: 0, ch: 0 }); cm.replaceSelection('-- kept in the folder\n'); });
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'));
  let tree = await files();
  assert.ok(tree['Disk/src/stopwatch.vhd'].startsWith('-- kept in the folder\n'));
  const example = JSON.parse(await fs.readFile(path.join(ROOT, 'examples/stopwatch/silinx.json'), 'utf8'));
  const pj = JSON.parse(tree['Disk/silinx.json']);
  assert.equal(tree['Disk/silinx.json'], `${JSON.stringify(pj, null, 2)}\n`);
  assert.deepEqual({ name: pj.name, board: pj.board, top: pj.top, files: pj.files, constraints: pj.constraints },
    { name: 'Disk', board: 'basys2', top: example.top, files: example.files, constraints: example.constraints });
  for (const f of await fs.readdir(path.join(ROOT, 'examples/stopwatch/src'))) assert.ok(`Disk/src/${f}` in tree, f);
  assert.equal(Object.keys(tree).some((k) => k.startsWith('InBrowser/')), false);
  // the browser storage's projects copied into the folder (once: then they are there)
  await page.menu('File', 'Copy Browser Projects to the Folder');
  await page.waitConsole(/Copied 1 project\(s\) from the browser's storage into the folder 'Silinx-projects': InBrowser\./);
  tree = await files();
  assert.equal(JSON.parse(tree['InBrowser/silinx.json']).name, 'InBrowser');
  assert.ok(tree['InBrowser/src/top.vhd']);
  await page.menu('File', 'Copy Browser Projects to the Folder');
  await page.waitConsole(/No project copied into the folder 'Silinx-projects'\.\s+WARNING: project 'InBrowser' was not copied: the folder 'Silinx-projects' already has a project of that name\./);
  // reloaded: the folder again (the browser still gives the permission), the project open, the edit kept
  await boot();
  await page.waitFor(() => window.Silinx.project?.name === 'Disk', [], { what: 'reopened from the folder' });
  await page.waitConsole(/Browser edition: projects are stored in the folder 'Silinx-projects' on the disk \(File > Use Browser Storage to keep them in this browser\)\. Implement Design/);
  assert.equal(await statusStorage(page), 'Storage: folder Silinx-projects');
  await page.eval(() => window.SilinxApp.openFile('src/stopwatch.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor && window.Silinx.active.editor.getValue().startsWith('-- kept in the folder\n'));
  // after a browser restart the permission is asked again (a click: Reopen <folder>)
  await page.eval(() => localStorage.setItem('__fakefs.permission', 'prompt'));
  await boot();
  await page.waitConsole(/The workspace folder 'Silinx-projects' needs the browser's permission again: Start page > Reopen Silinx-projects\./);
  assert.equal(await page.eval(() => window.Silinx.project), null);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  assert.deepEqual(await startEntries(page), [
    { text: 'In this browser\'s storage.', link: false, title: '' },
    { text: 'Reopen Silinx-projects', link: true, title: '' },
    { text: 'Open Workspace Folder…', link: true, title: '' },
  ]);
  assert.deepEqual((await fileMenu(page)).map((i) => i.label), ['Open Workspace Folder…', 'Reopen Silinx-projects']);
  await page.click('#start-page .start-storage a', { text: 'Reopen Silinx-projects' });
  await page.waitConsole(/Projects are now kept in the folder 'Silinx-projects' on the disk/);
  assert.equal(await page.eval(() => window.__fakeRoot.queryPermission({ mode: 'readwrite' })), 'granted');
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay table.grid tr td:first-child')].map((td) => td.textContent)), ['Disk', 'InBrowser']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the build's files go into the project's build/ folder, as the full application writes them
  await page.eval(() => window.SilinxApp.openProject('InBrowser').then(() => window.SilinxApp.showLeftPage('design')));
  await page.waitFor(() => window.Silinx.project?.name === 'InBrowser' && window.Silinx.project.top);
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/Bitstream downloaded: top\.bit/, { timeout: 120000 });
  await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
  assert.doesNotMatch(await page.consoleText(), /was not written into the workspace folder/);
  tree = await files();
  assert.ok(tree['InBrowser/build/top.bit']?.length > 100_000, Object.keys(tree).filter((k) => k.includes('/build/')).join(' '));
  assert.deepEqual((await page.eval(() => window.Silinx.fileTree)).filter((f) => f.startsWith('build/')), []);
  // back to the browser's storage: its own projects; the next visit stays there (the folder offered again)
  await page.menu('File', 'Use Browser Storage');
  await page.waitConsole(/Projects are now kept in this browser's storage\./);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  await boot();
  await page.waitConsole(/Browser edition: projects are stored in this browser/);
  assert.doesNotMatch(await page.consoleText(), /needs the browser's permission again/);
  assert.deepEqual((await startEntries(page)).map((e) => e.text), ['In this browser\'s storage.', 'Reopen Silinx-projects', 'Open Workspace Folder…']);
  // in Portuguese: the Start page, the status bar and the File menu (texts and tooltips) translated
  const texts = async () => {
    await page.eval(TEXTS);
    await page.openMenu(0); // File (Ficheiro);
    const t = await page.eval(() => [...window.__uiTexts(document.getElementById('start-page')), ...window.__uiTexts(document.getElementById('statusbar')),
      ...window.__uiTexts(document.querySelector('body > .menu-popup'))]);
    await page.closeMenus();
    return t;
  };
  const en = await texts();
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot();
  const pt = await texts();
  assert.ok(pt.includes('Reabrir Silinx-projects') && pt.includes('Onde Ficam os Projetos') && pt.includes('Armazenamento: este navegador'), pt.join(' | '));
  assert.deepEqual(untranslated(en, pt, [/^(InBrowser|Disk|Silinx-projects)$/]), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 120000 });

uiTest('browser edition without the File System Access API (Firefox, Safari): Open Workspace Folder… disabled, and why', E, async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_FOLDER_API });
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && document.querySelector('#start-page .start-storage'), [], { what: 'site boot' });
  await page.waitConsole(/Browser edition: projects are stored in this browser \(File > Download Project Bundle to keep a copy\)\. Implement Design/);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  assert.deepEqual(await fileMenu(page), [{ label: 'Open Workspace Folder…', disabled: true, title: UNSUPPORTED }]);
  assert.deepEqual(await startEntries(page), [
    { text: 'In this browser\'s storage.', link: false, title: '' },
    { text: 'Open Workspace Folder…', link: false, title: UNSUPPORTED },
    { text: 'A folder on the disk needs Chrome or Edge.', link: false, title: '' },
  ]);
  // the browser's storage works as before
  await newProject(page, 'NoFolder', 'blinky');
  assert.ok(await page.eval(() => JSON.parse(localStorage.getItem('silinx.standalone.fs')).NoFolder.json.name === 'NoFolder'));
}, { url: () => 'about:blank', skip: chromeOnly });
