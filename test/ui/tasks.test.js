// UI: the Tasks interface (#804, web/js/tasks.js, web/css/tasks.css): View ▸ Interface ▸ Tasks, the task
// switcher in the header (a tab bar at the bottom of a narrow screen), each task with its own arrangement
// and documents (the side panel and the messages folded or open, the last document in front), a task with
// no document offering its action, a maximized document; at a laptop's and a tablet's sizes, in English and
// Portuguese. The modern and classic interfaces are unchanged (test/ui/modern.test.js).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the page in the Tasks interface (kept, as View ▸ Interface keeps it), booted again
async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
// what is shown: displayed, with a size
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
// the current task, its arrangement and the tabs shown
const state = (page) => page.eval(() => {
  const d = document.documentElement.dataset;
  const vis = (e) => e.getClientRects().length > 0;
  return {
    task: d.task, side: d.side, console: d.console, max: d.max,
    current: [...document.querySelectorAll('#task-switch .task-btn[aria-current="true"]')].map((b) => b.dataset.task),
    tabs: [...document.querySelectorAll('#doc-tabs > .tab')].filter(vis).map((t) => t.querySelector('.tlabel').textContent),
    empty: vis(document.getElementById('task-empty')),
  };
});
// the page does not scroll sideways, nor does the header or the toolbar overflow
const noOverflow = (page) => page.eval(() => ({
  page: document.documentElement.scrollWidth <= innerWidth,
  over: [...document.querySelectorAll('#topbar, #toolbar, #task-tabs')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id),
}));
// no warnings: the page's console, the Warnings tab
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

uiTest('View ▸ Interface ▸ Tasks: the task switcher in the header, the task\'s bar; live, remembered, and back to Modern', E, async (page) => {
  await page.setViewport(1366, 768);
  // from the modern interface (whatever interface the suite runs in: SILINX_UI_INTERFACE)
  await page.eval(() => localStorage.setItem('silinx.ui', 'modern'));
  await page.reload();
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  // the modern interface has none of it
  assert.ok(!(await shown(page, '#task-switch')) && !(await shown(page, '#task-bar')) && !(await shown(page, '#task-tabs')));
  assert.ok(await shown(page, '.m-steps'));
  const items = await page.openMenu('View');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((x) => x.label === 'Interface') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent));
  assert.deepEqual(subs, ['Modern', 'Xilinx ISE (Classic)', 'Tasks']);
  await page.click('.menu-popup.sub .mi', { index: 2 });
  await page.waitFor(() => document.documentElement.dataset.layout === 'tasks', [], { what: 'the Tasks interface' });
  const L = await page.eval(() => ({
    ui: document.documentElement.dataset.ui, stored: localStorage.getItem('silinx.ui'),
    tasks: [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.textContent),
    steps: document.querySelector('.m-steps').getClientRects().length,
    bar: [...document.querySelectorAll('#task-bar [title]')].map((b) => b.title),
  }));
  assert.deepEqual(L, {
    ui: 'modern', stored: 'tasks', tasks: ['Edit', 'Simulate', 'Emulate', 'Implement', 'Program'], steps: 0,
    bar: ['Show or hide the side panel', 'Show or hide the messages', 'Maximize the document (double-click its tab)', 'Check'],
  });
  assert.ok(await shown(page, '#task-switch'));
  assert.ok(!(await shown(page, '#task-tabs')), 'the bottom tab bar: on a narrow screen only');
  // with no project: Edit, its page says what it does; its action (Check) needs a project
  assert.deepEqual(await state(page), { task: 'edit', side: 'open', console: 'open', max: 'off', current: ['edit'], tabs: [], empty: true });
  assert.equal(await page.eval(() => document.querySelector('#task-empty button').disabled), true);
  // the theme menu as in the modern interface
  assert.ok((await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
  // remembered: the page loads in the Tasks interface (set before the first paint)
  await page.reload();
  await page.waitFor(() => window.Silinx?.startupChecked, [], { what: 'app boot' });
  assert.deepEqual(await page.eval(() => [document.documentElement.dataset.ui, document.documentElement.dataset.layout]), ['modern', 'tasks']);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // back to Modern: the layout is the modern one again
  await page.eval(async () => (await import('/js/modern.js')).setInterface('modern'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(!(await shown(page, '#task-switch')) && !(await shown(page, '#task-bar')));
  assert.ok(await shown(page, '.m-steps'));
  // (a project opened: the start-up checks' warnings, which depend on the computer, are cleared)
  await makeProject(env, { name: 'TasksMenu', template: 'gates' });
  await page.openProject('TasksMenu');
  await noWarnings(page);
});

uiTest('Tasks at 1366 × 768: each task its arrangement and documents, a task with no document offers its action, maximize', E, async (page) => {
  await makeProject(env, { name: 'TasksLaptop', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksLaptop');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .cm-editor');
  let s = await state(page);
  assert.deepEqual([s.task, s.side, s.console, s.empty], ['edit', 'open', 'open', false]);
  assert.ok(s.tabs.includes('top.vhd'), s.tabs.join());
  assert.ok(await shown(page, '#hier') && await shown(page, '#console-body'));
  // Simulate, nothing simulated yet: its page and its action; the editor is not shown, the side panel and
  // the messages folded (the activity bar and the messages' tabs stay)
  await page.click('#task-switch .task-btn[data-task="sim"]');
  s = await state(page);
  assert.deepEqual(s, { task: 'sim', side: 'folded', console: 'folded', max: 'off', current: ['sim'], tabs: [], empty: true });
  assert.ok(!(await shown(page, '.doc .cm-editor')));
  assert.ok(!(await shown(page, '#hier')) && await shown(page, '#left-tabs'));
  assert.ok(!(await shown(page, '#console-body')) && await shown(page, '#console-tabs'));
  assert.equal(await page.eval(() => document.querySelector('#task-empty h2').textContent), 'Simulate');
  // its action: the simulation of the top module (as the toolbar's Simulate of the modern interface)
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  s = await state(page);
  assert.equal(s.task, 'sim');
  assert.equal(s.empty, false);
  assert.deepEqual(s.tabs.map((t) => t.replace(/ \(.*\)$/, '')), ['ISim']);
  // the side panel unfolds from the activity bar, kept for Simulate
  await page.click('#left-tabs .tab[data-page="design"]');
  assert.equal((await state(page)).side, 'open');
  // back to Edit: its editor in front again, its arrangement as left
  await page.click('#task-switch .task-btn[data-task="edit"]');
  s = await state(page);
  assert.deepEqual([s.task, s.side, s.console, s.empty], ['edit', 'open', 'open', false]);
  assert.ok(s.tabs.includes('top.vhd') && !s.tabs.some((t) => t.startsWith('ISim')), s.tabs.join());
  assert.ok(await shown(page, '.doc:not([hidden]) .cm-editor'));
  // Implement: the Design Summary opens by itself; Program: iMPACT
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary' });
  assert.deepEqual((await state(page)).tabs, ['Design Summary']);
  await page.click('#task-switch .task-btn[data-task="prog"]');
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('iMPACT'), [], { what: 'iMPACT' });
  s = await state(page);
  assert.deepEqual([s.task, s.side, s.console, s.tabs], ['prog', 'folded', 'open', ['iMPACT']]);
  // a document of another task brought to the front (the Window menu, a link…): its task comes to the front
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Edit in front' });
  // maximize: the document's tab double-clicked; kept for its task; the bar's button gives the space back
  await page.click('#task-switch .task-btn[data-task="sim"]');
  const tab = await page.point('#doc-tabs > .tab.active');
  await page.mouse('mousePressed', tab.x, tab.y, { clickCount: 1 }); await page.mouse('mouseReleased', tab.x, tab.y, { clickCount: 1 });
  await page.mouse('mousePressed', tab.x, tab.y, { clickCount: 2 }); await page.mouse('mouseReleased', tab.x, tab.y, { clickCount: 2 });
  await page.waitFor(() => document.documentElement.dataset.max === 'on', [], { what: 'maximized' });
  assert.ok(!(await shown(page, '#left')) && !(await shown(page, '#console-wrap')));
  const ws = await page.eval(() => document.getElementById('workspace').getBoundingClientRect().width);
  assert.ok(ws >= 1366 - 2, `the document has the width: ${ws}`);
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.equal((await state(page)).max, 'off');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.equal((await state(page)).max, 'on', 'kept for Simulate');
  await page.click('#task-bar [data-act="max"]');
  assert.equal((await state(page)).max, 'off');
  assert.ok(await shown(page, '#left'));
  // the messages: folded, they open from their tabs and from the bar
  assert.equal((await state(page)).console, 'folded');
  await page.click('#task-bar [data-act="console"]');
  assert.equal((await state(page)).console, 'open');
  assert.ok(await shown(page, '#console-body'));
  // kept per viewer, and after a reload
  const kept = await page.eval(() => JSON.parse(localStorage.getItem('silinx.tasks')));
  assert.equal(kept.task, 'sim');
  assert.deepEqual([kept.tasks.sim.side, kept.tasks.sim.console, kept.tasks.sim.max], [true, true, false]);
  assert.match(kept.tasks.edit.doc, /^file:src\/top\.vhd$/);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await noWarnings(page);
});

uiTest('Tasks on a tablet: the tab bar at the bottom in portrait, the header\'s switcher in landscape; a task closes the drawer', E, async (page) => {
  await makeProject(env, { name: 'TasksTablet', template: 'gates' });
  await page.setViewport(820, 1180);
  await tasksInterface(page);
  await page.openProject('TasksTablet');
  assert.ok(await shown(page, '#task-tabs') && !(await shown(page, '#task-switch')));
  const bar = await page.eval(() => {
    const r = document.getElementById('task-tabs').getBoundingClientRect();
    return { bottom: Math.round(innerHeight - r.bottom), buttons: [...document.querySelectorAll('#task-tabs .task-btn')].map((b) => Math.round(b.getBoundingClientRect().height)) };
  });
  assert.ok(bar.bottom <= 30, `at the bottom (above the status bar): ${bar.bottom}`);
  assert.ok(bar.buttons.every((hgt) => hgt >= 44), `touch targets: ${bar.buttons}`);
  // the drawer open (the Design pane): a task brought to the front closes it, the document first
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(true));
  await page.click('#task-tabs .task-btn[data-task="impl"]');
  await page.waitFor(() => document.documentElement.dataset.drawer === 'closed', [], { what: 'the drawer closed' });
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-tabs .task-btn[aria-current="true"]')].map((b) => b.dataset.task)), ['impl']);
  // the bar's side button opens the drawer
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.drawer === 'open', [], { what: 'the drawer open' });
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // landscape: the header's switcher, no tab bar
  await page.setViewport(1180, 820);
  await page.waitFor(() => document.getElementById('task-switch').getClientRects().length > 0, [], { what: 'the header switcher' });
  assert.ok(!(await shown(page, '#task-tabs')));
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await noWarnings(page);
});

uiTest('Tasks in Portuguese: the switcher, the task\'s bar and its page translated; the header fits at 1180 and 1280 px', E, async (page) => {
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.eval(TEXTS);
  const texts = () => page.eval(() => [...window.__uiTexts(document.getElementById('task-switch')), ...window.__uiTexts(document.getElementById('task-bar')), ...window.__uiTexts(document.getElementById('task-empty'))]);
  const en = await texts();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-switch .task-btn[data-task="sim"] .lbl').textContent === 'Simular', [], { what: 'Portuguese' });
  const pt = await texts();
  assert.deepEqual(untranslated(en, pt), []);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-switch .lbl')].map((l) => l.textContent)), ['Editar', 'Simular', 'Emular', 'Implementar', 'Programar']);
  assert.equal(await page.eval(() => document.querySelector('#task-empty p').textContent), 'Abra uma fonte no painel Projeto, ou verifique o projeto.');
  // the longer labels (the menus too) fit the header: a laptop, a tablet in landscape
  for (const [w, hgt] of [[1280, 800], [1180, 820], [1025, 768]]) {
    await page.setViewport(w, hgt);
    assert.deepEqual(await noOverflow(page), { page: true, over: [] }, `${w} px`);
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await makeProject(env, { name: 'TasksPt', template: 'gates' });
  await page.openProject('TasksPt');
  await noWarnings(page);
});
