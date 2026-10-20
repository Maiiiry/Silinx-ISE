// UI: the Development menu of a development build (#707): after Help, the changes since the last release by
// type (Features, Bug fixes, Other), each a window with its text and its issue; all of them in one window; the
// build's commit. The build's data is given to the page (harness: build), as the single file's build defines
// it; a page without it (a release, the local server) has no such menu. The text comes from changes/*.md: shown
// as text, its **bold** and `code` as elements, never as HTML.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BUILD = { commit: 'abc1234', date: '2026-10-20 12:00', since: '15.11.3', changes: [
  { issue: 30, type: 'feature', title: 'A menu', short: ['**A menu:** with `code` and <img src=x onerror="window.__xss = 1">'], detail: ['**A menu (#30):** the detail.'] },
  { issue: 12, type: 'bugfix', title: 'The router: a net routed at every seed', short: [], detail: ['**The router (#12):** fixed.'] },
] };
const menuTitles = (page) => page.eval(() => [...document.querySelectorAll('#menubar .item')].map((e) => e.textContent.trim()));
const rows = (page, sel) => page.eval((s) => [...document.querySelectorAll(`${s} > .mi`)].map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled') })), sel);

uiTest('Development menu (#707): after Help, the changes by type, each with its text and issue; all of them; in Portuguese', E, async (page) => {
  assert.deepEqual((await menuTitles(page)).slice(-2), ['Help', 'Development']);
  await page.openMenu('Development');
  assert.deepEqual(await rows(page, 'body > .menu-popup:not(.sub)'), [
    { label: 'Features (1)', disabled: false }, { label: 'Bug fixes (1)', disabled: false }, { label: 'Other (0)', disabled: true },
    { label: 'All Changes since 15.11.3…', disabled: false }, { label: 'This Build on GitHub (commit abc1234)', disabled: false }]);
  // Features ▸ the change: its window, its text as text (no element from it but its bold and code)
  await page.hover(await page.point('body > .menu-popup > .mi', { index: 0 }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual(await rows(page, '.menu-popup.sub'), [{ label: '#30 A menu', disabled: false }]);
  await page.click('.menu-popup.sub .mi', { index: 0 });
  await page.waitDialog('#30 A menu');
  const shown = await page.eval(() => {
    const b = document.querySelector('.dlg-overlay .dev-change');
    return { text: b.textContent, bold: [...b.querySelectorAll('b')].map((x) => x.textContent), code: [...b.querySelectorAll('code')].map((x) => x.textContent), img: b.querySelectorAll('img').length, xss: window.__xss ?? null };
  });
  assert.deepEqual(shown, { text: 'A menu: with code and <img src=x onerror="window.__xss = 1">A menu (#30): the detail.', bold: ['A menu:', 'A menu (#30):'], code: ['code'], img: 0, xss: null });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Open Issue #30 on GitHub', 'Close']);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // All Changes since 15.11.3…: by type, each with its issue's link
  await page.openMenu('Development');
  await page.click('body > .menu-popup > .mi', { text: 'All Changes since 15.11.3…' });
  await page.waitDialog('Changes since 15.11.3');
  assert.deepEqual(await page.eval(() => {
    const b = document.querySelector('.dlg-overlay .dev-changes');
    return { heads: [...b.querySelectorAll('h4')].map((x) => x.textContent), links: [...b.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]) };
  }), { heads: ['Features', 'Bug fixes'], links: [['#30', 'https://github.com/pmnmalo/Silinx-ISE/issues/30'], ['#12', 'https://github.com/pmnmalo/Silinx-ISE/issues/12']] });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // in Portuguese: the menu's labels, the changes' titles as they are
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.equal((await menuTitles(page)).at(-1), 'Desenvolvimento');
  await page.openMenu('Desenvolvimento');
  assert.deepEqual((await rows(page, 'body > .menu-popup:not(.sub)')).map((r) => r.label), ['Funcionalidades (1)', 'Correções (1)', 'Outras (0)', 'Todas as Alterações desde a 15.11.3…', 'Esta Versão no GitHub (commit abc1234)']);
  await page.hover(await page.point('body > .menu-popup > .mi', { index: 1 }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual((await rows(page, '.menu-popup.sub')).map((r) => r.label), ['#12 The router: a net routed at every seed']);
  await page.closeMenus();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
}, { build: BUILD });

uiTest('no Development menu without a development build (a release, the local server) (#707)', E, async (page) => {
  assert.equal((await menuTitles(page)).at(-1), 'Help');
  assert.ok(!(await menuTitles(page)).includes('Development'));
});
