// UI (#1430): Find in Project, from the toolbar (and Ctrl+Shift+F): every source of the project searched (HDL,
// constraints, test benches, the drawings' texts), its results by file, one opening its place; Replace (one, all) in
// the text sources, not in an HDL generated from a drawing; Undo Replace; options; Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DOC = '.doc:not([hidden]) .fp';

const results = (page) => page.eval((d) => ({
  status: document.querySelector(`${d} .fp-status`).textContent,
  files: [...document.querySelectorAll(`${d} .fp-file .fp-path`)].map((e) => e.textContent),
}), DOC);
const search = async (page, text, opts = {}) => {
  await page.eval((d, t, o) => {
    for (const [k, v] of Object.entries({ case: false, word: false, regex: false, ...o })) document.querySelector(`${d} .fp-${k}`).checked = v;
    const f = document.querySelector(`${d} .fp-find`); f.value = t; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  }, DOC, text, opts);
  await page.waitFor((d) => document.querySelector(`${d} .fp-status`).textContent !== '', [DOC], { what: 'the results' });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  return results(page);
};

uiTest('#1430 Find in Project: every source searched, a result opens its place; Replace one and all, Undo; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FindPj', template: 'blinky' });
  await page.openProject('FindPj');
  await page.click('#toolbar .tb-btn[title^="Find in Project"]');
  await page.waitFor(() => window.Silinx.active?.id === 'find', [], { what: 'Find in Project' });
  // every source: the constraints, the test bench, the HDL, the drawing (its texts) and the HDL generated from it
  let r = await search(page, 'clk');
  assert.ok(r.files.includes('constraints/top.ucf') && r.files.includes('sim/tb_top.vhd') && r.files.includes('src/top.vhd'), r.files.join());
  assert.match(r.status, /^\d+ result\(s\) in \d+ file\(s\)$/);
  r = await search(page, 'speed_ctrl');
  assert.ok(r.files.includes('src/speed_ctrl.asm.json'), `the drawing: ${r.files.join()}`);
  assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .fp-file`)].find((e) => e.dataset.path === 'src/speed_ctrl.vhd')?.querySelector('.fp-note')?.textContent.trim(), DOC), 'generated from its drawing: replace in the drawing');
  // the options: case, whole word, a regular expression; an error said
  assert.equal((await search(page, 'U_KNIGHT', { case: true })).status, 'No results');
  assert.notEqual((await search(page, 'U_KNIGHT')).status, 'No results', 'found without the case');
  assert.equal((await search(page, 'clk', { word: true })).files.includes('src/top.vhd'), true);
  assert.match((await search(page, '(', { regex: true })).status, /^Invalid regular expression: /);
  // a result opens its file at its line
  await search(page, 'u_knight', { word: true });
  await page.click(`${DOC} .fp-file[data-path="src/top.vhd"] ~ .fp-hit, ${DOC} .fp-group:has(.fp-file[data-path="src/top.vhd"]) .fp-hit`);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'the file opened' });
  // Replace All: in the text sources; Undo Replace puts them back
  await page.eval(() => window.SilinxApp.findDoc('find') && window.SilinxApp.openDoc({ id: 'find' }));
  const top0 = await readWs(env, 'FindPj', 'src/top.vhd');
  await search(page, 'u_knight', { word: true });
  await page.eval((d) => { document.querySelector(`${d} .fp-replace`).value = 'u_kitt'; }, DOC);
  await page.click(`${DOC} [data-act=replace-all]`);
  await page.waitFor(async () => /u_kitt/.test(await (await fetch('/api/projects/FindPj/file?path=src%2Ftop.vhd')).text()), [], { what: 'replaced', timeout: 15000 });
  assert.equal(await readWs(env, 'FindPj', 'src/top.vhd'), top0.replace(/\bu_knight\b/g, 'u_kitt'));
  await page.waitFor((d) => document.querySelector(`${d} .fp-status`).textContent === 'No results', [DOC], { what: 'none left' });
  await page.click(`${DOC} [data-act=undo]`);
  await page.waitFor(async (t) => (await (await fetch('/api/projects/FindPj/file?path=src%2Ftop.vhd')).text()) === t, [top0], { what: 'undone', timeout: 15000 });
  // one result replaced: only it
  r = await search(page, 'u_knight', { word: true });
  const n = await page.eval((d) => document.querySelectorAll(`${d} .fp-hit`).length, DOC);
  await page.eval((d) => { document.querySelector(`${d} .fp-replace`).value = 'u_kitt'; }, DOC);
  await page.click(`${DOC} .fp-hit .fp-one`);
  await page.waitFor((d, k) => document.querySelectorAll(`${d} .fp-hit`).length === k - 1, [DOC, n], { what: 'one replaced', timeout: 15000 });
  assert.equal((await readWs(env, 'FindPj', 'src/top.vhd')).split('u_kitt').length - 1, 1);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => document.querySelector(`${d} h2`)?.textContent === 'Procurar no Projeto', [DOC], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .fp-row label, ${d} .fp-row .btn`)].map((e) => e.textContent.trim()), DOC),
    ['Procurar:', 'Procurar', 'Substituir por:', 'Substituir Tudo', 'Anular Substituição', 'Maiúsculas e minúsculas', 'Palavra inteira', 'Expressão regular']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .fp-status`).textContent, DOC), 'Sem resultados', 'the one replaced: none left');
  await search(page, 'clk');
  await page.waitFor((d) => /^\d+ resultado\(s\) em \d+ ficheiro\(s\)$/.test(document.querySelector(`${d} .fp-status`).textContent), [DOC], { what: 'Portuguese results' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#1430 Find in Project: Ctrl+Shift+F opens it', E, async (page) => {
  await makeProject(env, { name: 'FindKey', template: 'blinky' });
  await page.openProject('FindKey');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor, [], { what: 'the editor' });
  await page.eval(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true })));
  await page.waitFor(() => window.Silinx.active?.id === 'find', [], { what: 'Find in Project' });
});
