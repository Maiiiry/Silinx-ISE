// UI: the developer demo pages served with the application (web/*-demo.html, #484): names from the HDL
// (a Verilog escaped identifier may hold < > " &) are shown as text, never parsed as HTML, in the
// schematic viewer's instance tree and in the schematic editor's list of top modules.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a module and an instance whose names would be markup in innerHTML
const EVIL_MODULE = 'x"><img/src=x/onerror=window.__pwned=1>';
const EVIL_INST = 'u<b>1</b>';
const HOSTILE = `module \\${EVIL_MODULE} (input a, output y);\n  assign y = ~a;\nendmodule\n`
  + `module top (input a, output y);\n  \\${EVIL_MODULE} \\${EVIL_INST} (.a(a), .y(y));\nendmodule\n`;

uiTest('#484 schematic-demo.html: instance and module names from the HDL shown as text in the tree, not parsed as HTML', E, async (page) => {
  await page.goto(`${env.server.url}/schematic-demo.html`);
  await page.waitFor(() => document.querySelector('#tree .row'), [], { what: 'the demo page' });
  // a library of the demo's own data module, added and picked as the page's selector does
  await page.eval(async (text) => {
    const { LIBRARIES } = await import('/js/schematic-demo-data.js');
    LIBRARIES.hostile = { label: 'Hostile', tops: ['top'], sources: [{ path: 'hostile.v', text }] };
    const sel = document.getElementById('libSel');
    sel.add(new Option('Hostile', 'hostile'));
    sel.value = 'hostile';
    sel.dispatchEvent(new Event('change'));
  }, HOSTILE);
  await page.waitFor(() => document.querySelectorAll('#tree .row').length === 2, [], { what: 'the hostile tree' });
  const tree = await page.eval(() => ({
    rows: [...document.querySelectorAll('#tree .row')].map((r) => [r.textContent, r.dataset.path]),
    markup: document.querySelectorAll('#tree img, #tree b').length,
    pwned: window.__pwned ?? null,
  }));
  assert.deepEqual(tree, { rows: [['▾top (top)', 'top'], [`${EVIL_INST} (${EVIL_MODULE})`, `top.${EVIL_INST}`]], markup: 0, pwned: null });
  // the row still opens its instance (its path read back from the attribute)
  await page.click('#tree .row', { index: 1 });
  await page.waitFor((p) => document.getElementById('status').textContent.startsWith(`Opened ${p}`), [`top.${EVIL_INST}`], { what: 'the instance opened' });
});

uiTest('#484 sch-editor-demo.html: the list of top modules built from the typed HDL holds the names as text', E, async (page) => {
  await page.goto(`${env.server.url}/sch-editor-demo.html`);
  await page.waitFor(() => document.getElementById('hdl-in'), [], { what: 'the demo page' });
  await page.eval((text) => { const t = document.getElementById('hdl-in'); t.value = text; t.dispatchEvent(new Event('input')); }, HOSTILE);
  await page.waitFor(() => document.querySelectorAll('#top option').length === 2, [], { what: 'the top modules' });
  const opts = await page.eval(() => [...document.querySelectorAll('#top option')].map((o) => [o.value, o.textContent, o.getAttributeNames().join(',')]));
  assert.deepEqual(opts, [[EVIL_MODULE, EVIL_MODULE, 'value'], ['top', 'top', 'value']]);
  assert.equal(await page.eval(() => document.getElementById('top').value), 'top');
  assert.equal(await page.eval(() => window.__pwned ?? null), null);
});
