// UI: the Tasks interface's Simulate (web/js/tasks-sim.js, web/css/tasks.css; #800, #782): the simulator as the task
// shows it, the waves with the most room (#1017: no status line; #1026: its icons in the wave window's line), the
// modern and classic interfaces as they were.
// The rest of the Tasks interface: test/ui/tasks.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// the Tasks interface is a development build's only, for now (#838)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };

// the page in the Tasks interface (kept, as View ▸ Interface keeps it), booted again
async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
// what is shown: displayed, with a size
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
// the interface switched (View ▸ Interface)
const setInterface = (page, ui) => page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
// no warnings: the page's console, the Warnings tab
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// Simulate in the Tasks interface, its test bench simulated (the initial 1 us run done)
async function simulateBench(page, name) {
  await makeProject(env, { name, template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject(name);
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-wavewin') && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '')
    && !window.Silinx.active.view.state.running, [], { what: 'ISim ran', timeout: 30000 });
}

uiTest('#1017 Tasks ▸ Simulate: no "Ready … Sim Time" status line; the modern and classic interfaces keep it', E, async (page) => {
  await simulateBench(page, 'TasksSimStatus');
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-status')), 'no status line');
  // the waves go down to the bottom of the simulator (where the status line was)
  const gap = await page.eval(() => Math.round(document.querySelector('.doc:not([hidden]) .isim').getBoundingClientRect().bottom - document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect().bottom));
  assert.ok(gap <= 2, `the waves to the bottom: ${gap}`);
  // the simulator's state still kept (the other interfaces show it), and its console in the message centre
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-st-msg').textContent), 'Ready');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln[data-src="sim"]')].some((l) => /circuit initialization/.test(l.textContent)), [], { what: 'ISim\'s lines in the message centre' });
  // the classic interface (#1149: the modern one is the Tasks one): the status line as it was
  for (const ui of ['classic']) {
    await setInterface(page, ui);
    await page.waitFor(() => !document.documentElement.dataset.layout, [], { what: ui });
    assert.ok(await shown(page, '.doc:not([hidden]) .isim-status'), `${ui}: the status line`);
    assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-st-time').textContent), /^Sim Time: 1,000,000 ps$/);
  }
  await noWarnings(page);
}, { build: DEV });

// the simulator's toolbar: in the wave window's line (Tasks), or its own line under the title bar (as ISim made it)
const toolbarAt = (page) => page.eval(() => {
  const root = document.querySelector('.doc:not([hidden]) .isim'), tb = root.querySelector('.isim-toolbar');
  return tb.parentElement.matches('.isim-wavewin > .caption') ? 'caption' : tb.previousElementSibling?.matches('.isim-title') ? 'top' : 'elsewhere';
});
uiTest('#1026 Tasks ▸ Simulate: the simulator\'s icons in the wave window\'s line, no "Default.wcfg" nor cursor text; in Portuguese; modern and classic unchanged', E, async (page) => {
  await simulateBench(page, 'TasksSimToolbar');
  assert.equal(await toolbarAt(page), 'caption');
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-wcfg')) && !(await shown(page, '.doc:not([hidden]) .isim-cursor-info')), 'no name, no cursor text');
  // one line: the wave window at the top of the simulator (under the tabs), its icons shown and working
  const L = await page.eval(() => {
    const root = document.querySelector('.doc:not([hidden]) .isim'), r = (s) => root.querySelector(s).getBoundingClientRect();
    const btns = [...root.querySelectorAll('.isim-wavewin > .caption .tb-btn')];
    // (the wave window under the simulations' tabs, which are to the right of the side panel: #1259)
    const tabs = document.getElementById('doc-tabs').getBoundingClientRect();
    return { top: Math.round(r('.isim-wavewin').top - Math.max(r('.isim-main').top, tabs.height ? tabs.bottom : 0)), main: Math.round(r('.isim-main').top - root.getBoundingClientRect().top),
      shown: btns.filter((b) => b.getClientRects().length && b.getBoundingClientRect().width > 0).length, all: btns.length,
      caption: Math.round(r('.isim-wavewin > .caption').height), titles: btns.map((b) => b.title) };
  });
  assert.equal(L.main, 0, 'no toolbar line above the simulator\'s panes');
  assert.ok(L.top <= 1, `the wave window at the top: ${L.top}`);
  assert.equal(L.shown, L.all, `every icon shown: ${JSON.stringify(L)}`);
  assert.ok(L.caption <= 48, `one line: ${L.caption}`);
  assert.deepEqual(L.titles.slice(0, 4), ['Restart', 'Run All', 'Run for the specified time', 'Step (advance to the next scheduled event)']);
  // the icons work there: Zoom In, Run for
  const scale = await page.eval(() => window.Silinx.active.view.state.scale);
  await page.click('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn[title="Zoom In"]');
  await page.waitFor((s) => window.Silinx.active.view.state.scale < s, [scale], { what: 'zoomed in' });
  await page.click('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn[title="Run for the specified time"]');
  await page.waitFor(() => /Sim Time: 2,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time').textContent) && !window.Silinx.active.view.state.running, [], { what: 'ran 1 us more' });
  // in Portuguese: the icons' tooltips
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn').title === 'Reiniciar', [], { what: 'Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn')].slice(0, 4).map((b) => b.title)),
    ['Reiniciar', 'Executar Tudo', 'Executar durante o tempo indicado', 'Passo (avançar para o próximo evento)']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface (#1149: the modern one is the Tasks one): the toolbar on its own line again, the name and the cursor's text shown
  for (const ui of ['classic']) {
    await setInterface(page, ui);
    await page.waitFor(() => !document.documentElement.dataset.layout, [], { what: ui });
    assert.equal(await toolbarAt(page), 'top', ui);
    assert.ok(await shown(page, '.doc:not([hidden]) .isim-wcfg') && await shown(page, '.doc:not([hidden]) .isim-cursor-info'), `${ui}: the name and the cursor`);
  }
  // and back to Tasks: in the line again
  await setInterface(page, 'modern');
  await page.waitFor(() => document.documentElement.dataset.layout === 'tasks', [], { what: 'tasks' });
  assert.equal(await toolbarAt(page), 'caption');
  await noWarnings(page);
}, { build: DEV });

// #1018: the task's bar's choices simulate at once, with no Simulate button beside them
// (the log's text: the messages may be folded, so not its innerText)
const logText = (page) => page.eval(() => document.getElementById('console-log').textContent);
const started = async (page, from) => [...(await logText(page)).slice(from).matchAll(/Started : "Simulate (?:Behavioral|Post-Synthesis|Post-Translate|Post-Map|Post-Place & Route) Model"\./g)].map((m) => m[0]);
const choose = (page, id, value) => page.eval((i, v) => { const s = document.getElementById(i); s.value = v; s.dispatchEvent(new Event('change')); }, id, value);
// the simulator shown: its module and model (its tab's title: several simulations may be open, #1161), ready
const simShown = (page, module, model) => page.waitFor((m, k) => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && !window.Silinx.active.view.state.running
  && window.Silinx.active.title === (k === 'Behavioral' ? `SSim (${m})` : `SSim (${m}, ${k})`), [module, model], { what: `ISim of ${module}, ${model}`, timeout: 180000 });
uiTest('#1018 Tasks ▸ Simulate: choosing the test bench or the model simulates it once (the model generated first), no Simulate button', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await simulateBench(page, 'TasksSimChoice');
  // no action button in the task's bar (#1292); the choices on Simulate's page (#1291), its document open: not shown
  assert.ok(!(await shown(page, '#task-bar [data-act="main"]')), 'no Simulate button');
  assert.ok(!(await shown(page, '#task-bench')) && !(await shown(page, '#task-model')));
  // a module chosen: simulated once, at once
  let from = (await logText(page)).length;
  await choose(page, 'task-bench', 'top');
  await simShown(page, 'top', 'Behavioral');
  assert.deepEqual(await started(page, from), ['Started : "Simulate Behavioral Model".']);
  // the test bench again, then a design module while it is being prepared: the last choice is the one shown
  from = (await logText(page)).length;
  await choose(page, 'task-bench', 'tb_top');
  await choose(page, 'task-bench', 'top');
  await page.waitFor(() => window.Silinx.project.simTop === 'top', [], { what: 'top chosen' });
  await simShown(page, 'top', 'Behavioral');
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await page.eval(() => window.Silinx.active.title), 'SSim (top)', 'the last choice stays');
  // (each module its simulation, several open: the test bench's and top's, #1161)
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.docs.filter((d) => /^isim:/.test(d.id)).map((d) => d.id).sort()), ['isim:tb_top', 'isim:top']);
  // back to the test bench
  from = (await logText(page)).length;
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  assert.deepEqual(await started(page, from), ['Started : "Simulate Behavioral Model".']);
  // a model not generated yet: offered first ("Generate and Simulate", #490), generated, then simulated once
  from = (await logText(page)).length;
  await choose(page, 'task-model', 'postsynth');
  await page.waitDialog('Simulate Post-Synthesis Model');
  await page.dialogButton('Generate and Simulate');
  await page.waitNoDialog();
  await simShown(page, 'tb_top', 'Post-Synthesis');
  const log = (await logText(page)).slice(from);
  assert.match(log, /Process "Generate Post-Synthesis Simulation Model" completed successfully/);
  assert.deepEqual(await started(page, from), ['Started : "Simulate Post-Synthesis Model".']);
  // and Behavioral again: at once, no dialog
  from = (await logText(page)).length;
  await choose(page, 'task-model', '');
  await simShown(page, 'tb_top', 'Behavioral');
  assert.deepEqual(await started(page, from), ['Started : "Simulate Behavioral Model".']);
  // the other tasks: no action button in the bar either (#1292)
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await shown(page, '#task-bar [data-act="main"]')), 'no Check in the bar');
  await noWarnings(page);
}, { build: DEV, timeout: 300000 });

// #1161: Simulate keeps a tab per simulation (each test bench and model its own); its side panel, Simulation and
// Instances, a tab as Design's pages, lists every test bench of the project, the one simulated opened as its instances,
// another one simulated (in its own tab) when clicked; the classic interface's ISim as before; Design has no Test page
uiTest('#1161 Tasks ▸ Simulate: a tab per simulation; Simulation lists the test benches, another one simulated by a click', E, async (page) => {
  const tb = fs.readFileSync(path.join(ROOT, 'examples/blinky/sim/tb_top.vhd'), 'utf8');
  await makeProject(env, { name: 'TasksSimTabs', template: 'blinky', files: { 'sim/tb_two.vhd': tb.replaceAll('tb_top', 'tb_two') }, roles: { 'sim/tb_two.vhd': 'sim' } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimTabs');
  assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab[data-page="test"]')), null, 'no Test page in Design');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  await page.showSide();
  const panel = () => page.eval(() => {
    const d = document.querySelector('.doc:not([hidden]) .isim'), vis = (e) => !!e && e.getClientRects().length > 0;
    return { tab: vis(d.querySelector('.task-sim-tabs')) ? d.querySelector('.task-sim-tabs').textContent : null, caption: vis(d.querySelector('.isim-inst-panel > .caption')),
      rows: [...d.querySelectorAll('.isim-tree > li > .row')].filter(vis).map((r) => r.querySelector('.lbl').textContent),
      open: [...d.querySelectorAll('.isim-tree > li')].filter((li) => li.querySelector(':scope > ul')).map((li) => li.querySelector('.lbl').textContent) };
  });
  assert.deepEqual(await panel(), { tab: 'Simulation', caption: false, rows: ['tb_top', 'tb_two'], open: ['tb_top'] });
  // the other test bench clicked: simulated in its own tab, the first one kept
  await page.click('.doc:not([hidden]) .isim-tree li.task-bench .row');
  await simShown(page, 'tb_two', 'Behavioral');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#doc-tabs .tab')].filter((t) => t.getClientRects().length).map((t) => t.querySelector('.tlabel').textContent)), ['SSim (tb_top)', 'SSim (tb_two)']);
  await page.showSide();
  assert.deepEqual(await panel(), { tab: 'Simulation', caption: false, rows: ['tb_top', 'tb_two'], open: ['tb_two'] });
  // and back to the first by its row: its tab again, not a new simulation
  const from = (await logText(page)).length;
  await page.click('.doc:not([hidden]) .isim-tree li.task-bench .row');
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_top', [], { what: 'tb_top\'s tab' });
  assert.deepEqual(await started(page, from), []);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .task-sim-tabs')?.textContent === 'Simulação', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface: Instances and Processes as before, the simulated bench only
  await setInterface(page, 'classic');
  await page.waitFor(() => !document.documentElement.dataset.layout, [], { what: 'classic' });
  assert.deepEqual(await panel(), { tab: null, caption: true, rows: ['tb_top'], open: ['tb_top'] });
});

// #1343: a module's HDL opened from the Simulation tree: the simulation's side panel stays at its left, the source beside it
uiTest('#1343 Tasks ▸ Simulate: a test bench\'s HDL from the Simulation tree opens beside the tree, not over it; folded: alone', E, async (page) => {
  await makeProject(env, { name: 'TasksSimHdl', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimHdl');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  await page.showSide();
  await page.click('.doc:not([hidden]) .isim-tree > li > .row .badge', { text: 'VHDL' });
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_top.vhd' && window.Silinx.active.editor, [], { what: 'the test bench\'s HDL' });
  const g = () => page.eval(() => {
    const r = (e) => e && e.getClientRects().length ? e.getBoundingClientRect() : null;
    const side = r(document.querySelector('#workspace > .doc .isim-left')), file = r(window.Silinx.active.el), tabs = r(document.getElementById('doc-tabs'));
    return { task: document.documentElement.dataset.task, side: !!side && side.width > 100, besides: !!side && file.left >= side.right - 1, tabs: !!side && Math.abs(tabs.left - side.right) < 2,
      waves: !!r(document.querySelector('#workspace > .doc .isim-wavewin')), tree: [...document.querySelectorAll('#workspace > .doc .isim-tree > li > .row .lbl')].filter((e) => e.getClientRects().length).map((e) => e.textContent) };
  });
  assert.deepEqual(await g(), { task: 'sim', side: true, besides: true, tabs: true, waves: false, tree: ['tb_top'] });
  // its editor bar shown under the tabs, the source editable (#1357)
  assert.deepEqual(await page.eval(() => {
    const bar = window.Silinx.active.el.querySelector('.editor-bar').getBoundingClientRect(), tabs = document.getElementById('doc-tabs').getBoundingClientRect();
    const at = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
    return { under: bar.top >= tabs.bottom - 1, onTop: !!at?.closest('.editor-bar'), editable: !window.Silinx.active.editor.readOnly?.() };
  }), { under: true, onTop: true, editable: true });
  // folded: the source alone
  await page.click('#task-view [data-act=side]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded');
  assert.equal(await page.eval(() => Math.round(window.Silinx.active.el.getBoundingClientRect().left)), await page.eval(() => Math.round(document.getElementById('workspace').getBoundingClientRect().left)));
  await page.click('#task-view [data-act=side]');
  // the simulation's tab: the simulation again, its waves
  await page.click('#doc-tabs > .tab', { text: 'SSim (tb_top)' });
  await page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || ''), [], { what: 'the simulation' });
  assert.equal(await page.eval(() => !!document.querySelector('#workspace > .doc[data-sim-side]')), false);
  assert.doesNotMatch(await logText(page), /WARNING|ERROR/);
}, { build: DEV });

// #1345: Maximize in Simulate hides the simulation's side panel too (the waves from the left edge); restored, it is back
uiTest('#1345 Tasks ▸ Simulate: Maximize hides the side panel too, the waves from the left edge; restored, as it was', E, async (page) => {
  await makeProject(env, { name: 'TasksSimMax', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimMax');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  await page.showSide();
  const g = () => page.eval(() => {
    const vis = (s) => !!document.querySelector(`.doc:not([hidden]) ${s}`)?.getClientRects().length;
    const w = document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect(), ws = document.getElementById('workspace').getBoundingClientRect();
    return { side: vis('.isim-left'), fromLeft: Math.abs(w.left - ws.left) < 2, console: !!document.getElementById('console-wrap').getClientRects().length };
  });
  assert.deepEqual(await g(), { side: true, fromLeft: false, console: true });
  await page.click('#task-view [data-act=max]');
  await page.waitFor(() => document.documentElement.dataset.max === 'on');
  assert.deepEqual(await g(), { side: false, fromLeft: true, console: false });
  await page.click('#task-view [data-act=max]');
  await page.waitFor(() => document.documentElement.dataset.max === 'off');
  assert.deepEqual(await g(), { side: true, fromLeft: false, console: true });
}, { build: DEV });

// #1353: the simulation's model at the right end of its toolbar, after Edit Stimuli: its own model shown; another one
// chosen simulates the module with it, in a tab of its own
uiTest('#1353 Tasks ▸ Simulate: the model chosen in the wave window\'s toolbar, after Edit Stimuli; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'TasksSimModel', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimModel');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  const g = () => page.eval(() => {
    const tb = document.querySelector('.doc:not([hidden]) .isim-toolbar'), s = tb.querySelector('.isim-model');
    const stim = [...tb.querySelectorAll('.tb-btn')].find((b) => /Edit Stimuli/.test(b.textContent));
    return s && { value: s.value, options: [...s.options].map((o) => o.textContent), last: tb.lastElementChild === s,
      right: Math.abs(s.getBoundingClientRect().right - tb.getBoundingClientRect().right) < 12, afterStim: !!stim && s.getBoundingClientRect().left > stim.getBoundingClientRect().right };
  });
  assert.deepEqual(await g(), { value: '', options: ['Behavioral', 'Post-Synthesis', 'Post-Translate', 'Post-Map', 'Post-Place & Route'], last: true, right: true, afterStim: true });
  // Post-Synthesis chosen: generated, then simulated in its own tab; this one keeps Behavioral
  await page.eval(() => { const s = document.querySelector('.doc:not([hidden]) .isim-toolbar .isim-model'); s.value = 'postsynth'; s.dispatchEvent(new Event('change')); });
  await page.waitDialog();
  await page.dialogButton('Generate and Simulate');
  await simShown(page, 'tb_top', 'Post-Synthesis');
  assert.equal((await g()).value, 'postsynth');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-toolbar .isim-model option')?.textContent === 'Comportamental', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface: none
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.querySelectorAll('.isim-toolbar .isim-model').length), 0);
}, { build: DEV, timeout: 300000 });

// #1316, #1332: the Simulation tree's test bench shows its types: [Waveform] marked, the simulation's view, then its HDL's
// (no drawing's: Design's); its instances none (#1365); [Waveform] brings the waveform to the front, the HDL's opens the
// file here, in Simulation
uiTest('#1316 #1332 #1365 Tasks ▸ Simulate: the Simulation tree\'s test bench [Waveform*] and its HDL, its instances no badges; the HDL badge opens the file in Simulation, [Waveform] the waveform; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TasksSimBadges', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimBadges');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  await page.showSide();
  const rows = () => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-tree .row')].filter((r) => r.querySelector('.lbl') && r.getClientRects().length)
    .map((r) => [r.querySelector('.lbl').textContent, ...[...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`)].join(' ')));
  const r = await rows();
  for (const want of ['tb_top Waveform* VHDL*', 'uut', 'u_speed', 'u_pre']) assert.ok(r.includes(want), `${want}: ${r.join(' | ')}`);
  assert.ok(!r.some((x) => /ASM/.test(x)), r.join(' | '));
  // tb_top's [VHDL]: its file opened here, the task still Simulation, the document Simulation's
  const sim = await page.eval(() => window.Silinx.active.id);
  const badgeOf = (name, text) => page.eval((n, t) => { const row = [...document.querySelectorAll('.doc:not([hidden]) .isim-tree .row')].find((x) => x.querySelector('.lbl')?.textContent === n);
    const b = [...row.querySelectorAll('.badge')].find((x) => x.textContent === t); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); }, name, text);
  await badgeOf('tb_top', 'VHDL');
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_top.vhd', [], { what: 'the test bench\'s file open' });
  assert.deepEqual(await page.eval(() => [document.querySelector('#task-switch .task-btn[aria-current="true"]')?.dataset.task, window.Silinx.active.el.dataset.task, window.Silinx.active.task]), ['sim', 'sim', 'sim']);
  // [Waveform] (the simulation in front again, an instance selected): the test bench selected, the waveform in front
  await page.eval(async (id) => (await import('/js/app.js')).openDoc({ id }), sim);
  await page.click('.doc:not([hidden]) .isim-tree .row .lbl', { text: 'u_speed' });
  await badgeOf('tb_top', 'Waveform');
  await page.waitFor((id) => window.Silinx.active?.id === id && document.querySelector('.doc:not([hidden]) .isim-tree .row.sel .lbl')?.textContent === 'tb_top', [sim], { what: 'tb_top selected, the waveform in front' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-tree .badge')].some((b) => b.textContent === 'Forma de Onda'), [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.doesNotMatch(await logText(page), /WARNING|ERROR/);
}, { build: DEV });

// #1267: a test bench clicked in Simulation: its instances shown expanded, the other benches collapsed (▸)
uiTest('#1267 Tasks ▸ Simulate: a test bench clicked in Simulation shows its instances expanded, the other benches collapsed', E, async (page) => {
  const tb = fs.readFileSync(path.join(ROOT, 'examples/blinky/sim/tb_top.vhd'), 'utf8');
  await makeProject(env, { name: 'TasksSimOpen', template: 'blinky', files: { 'sim/tb_two.vhd': tb.replaceAll('tb_top', 'tb_two') }, roles: { 'sim/tb_two.vhd': 'sim' } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimOpen');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  await page.showSide();
  // the benches' rows: "twisty name", and whether its instances are shown
  const tree = () => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-tree > li')].filter((li) => li.getClientRects().length)
    .map((li) => `${li.querySelector('.twisty').textContent} ${li.querySelector('.lbl').textContent}${li.querySelector(':scope > ul') ? ' +' : ''}`));
  const row = (name) => page.click('.doc:not([hidden]) .isim-tree > li > .row', { index: ['tb_top', 'tb_two'].indexOf(name) });
  assert.deepEqual(await tree(), ['▾ tb_top +', '▸ tb_two']);
  // collapsed by its twisty, then its row clicked: expanded again
  await page.click('.doc:not([hidden]) .isim-tree > li > .row .twisty', { index: 0 });
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .isim-tree > li > ul'), [], { what: 'collapsed' });
  assert.deepEqual(await tree(), ['▸ tb_top', '▸ tb_two']);
  await page.click('.doc:not([hidden]) .isim-tree > li > .row .lbl', { index: 0 });
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .isim-tree > li > ul'), [], { what: 'expanded by its row' });
  // the other bench clicked: its instances shown, tb_top collapsed
  await row('tb_two');
  await simShown(page, 'tb_two', 'Behavioral');
  await page.showSide();
  assert.deepEqual(await tree(), ['▸ tb_top', '▾ tb_two +']);
  // collapsed in tb_two's tree, then tb_top and tb_two again by their rows: each one expanded when clicked
  await page.click('.doc:not([hidden]) .isim-tree > li > .row .twisty', { index: 1 });
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .isim-tree > li > ul'), [], { what: 'tb_two collapsed' });
  await row('tb_top');
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_top', [], { what: 'tb_top\'s tab' });
  await page.waitFor(() => /tb_top \+/.test([...document.querySelectorAll('.doc:not([hidden]) .isim-tree > li')].map((li) => `${li.querySelector('.lbl').textContent}${li.querySelector(':scope > ul') ? ' +' : ''}`).join('|')), [], { what: 'tb_top expanded' });
  assert.deepEqual(await tree(), ['▾ tb_top +', '▸ tb_two']);
  await row('tb_two');
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_two', [], { what: 'tb_two\'s tab' });
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .isim-tree > li > ul'), [], { what: 'tb_two expanded again' });
  assert.deepEqual(await tree(), ['▸ tb_top', '▾ tb_two +']);
  assert.doesNotMatch(await logText(page), /WARNING|ERROR/);
}, { build: DEV });

// #1259: the side panel from the top of the work area, as Design's and Implement's; the simulations' tabs to its right
uiTest('#1259 Tasks ▸ Simulate: the side panel from the top, the simulations\' tabs to its right above the waves; folded: the tabs from the left', E, async (page) => {
  const tb = fs.readFileSync(path.join(ROOT, 'examples/blinky/sim/tb_top.vhd'), 'utf8');
  await makeProject(env, { name: 'TasksSimSide', template: 'blinky', files: { 'sim/tb_two.vhd': tb.replaceAll('tb_top', 'tb_two') }, roles: { 'sim/tb_two.vhd': 'sim' } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSimSide');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await choose(page, 'task-bench', 'tb_top');
  await simShown(page, 'tb_top', 'Behavioral');
  await choose(page, 'task-bench', 'tb_two');
  await simShown(page, 'tb_two', 'Behavioral');
  await page.showSide();
  const box = () => page.eval(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }; };
    const d = document.querySelector('.doc:not([hidden]) .isim'), vis = (e) => !!e && e.getClientRects().length > 0;
    const left = d.querySelector('.isim-left');
    return { center: r(document.getElementById('center')), tabs: r(document.getElementById('doc-tabs')), side: vis(left) ? r(left) : null,
      split: vis(left) ? r(d.querySelector('.isim-split-main')) : null, head: vis(left) ? r(d.querySelector('.task-sim-tabs')) : null, waves: r(d.querySelector('.isim-wavewin')) };
  });
  // open: the side panel and its header at the top, the tabs from its splitter to the right edge, the waves below them
  let b = await box();
  assert.deepEqual([b.side.y, b.head.y], [b.center.y, b.center.y], JSON.stringify(b));
  assert.deepEqual([b.tabs.y, b.tabs.x, b.tabs.r], [b.center.y, b.split.r, b.center.r], JSON.stringify(b));
  assert.deepEqual([b.waves.y, b.waves.x], [b.tabs.b, b.split.r], JSON.stringify(b));
  // the side panel wider (its splitter): the tabs follow it
  await page.eval(() => {
    const s = document.querySelector('.doc:not([hidden]) .isim-split-main'), at = s.getBoundingClientRect();
    const o = { bubbles: true, button: 0, pointerId: 1, isPrimary: true, clientX: at.x + 2, clientY: at.y + 200 };
    s.dispatchEvent(new PointerEvent('pointerdown', o)); s.dispatchEvent(new MouseEvent('mousedown', o));
    for (const t of [window, document]) { t.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: at.x + 82 })); t.dispatchEvent(new MouseEvent('mousemove', { ...o, clientX: at.x + 82 })); }
    window.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: at.x + 82 })); document.dispatchEvent(new MouseEvent('mouseup', { ...o, clientX: at.x + 82 }));
  });
  await page.waitFor((w) => document.querySelector('.doc:not([hidden]) .isim-left').getBoundingClientRect().width > w + 40, [b.side.r - b.side.x], { what: 'the side panel wider' });
  await page.waitFor(() => Math.round(document.getElementById('doc-tabs').getBoundingClientRect().x) === Math.round(document.querySelector('.doc:not([hidden]) .isim-split-main').getBoundingClientRect().right), [], { what: 'the tabs after it' });
  // folded: the tabs and the waves from the left edge
  await page.click('#task-view [data-act=side]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded');
  await page.waitFor(() => Math.round(document.getElementById('doc-tabs').getBoundingClientRect().x) === Math.round(document.getElementById('center').getBoundingClientRect().x), [], { what: 'the tabs from the left' });
  b = await box();
  assert.equal(b.side, null);
  assert.deepEqual([b.waves.x, b.waves.y], [b.center.x, b.tabs.b], JSON.stringify(b));
  // the classic interface: the tabs under the waves' document as before (not moved)
  await setInterface(page, 'classic');
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => getComputedStyle(document.getElementById('doc-tabs')).position), 'static');
  assert.doesNotMatch(await logText(page), /WARNING|ERROR/);
}, { build: DEV });
