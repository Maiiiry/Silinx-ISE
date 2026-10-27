// UI (#1524): Silinx HLS in the app: a .c file opens in the editor with C's highlighting and its checks' messages as
// lint marks; Check Syntax (the editor's button, its menu) logs the top function and lists the errors and warnings,
// each with its plain-language help (English, Portuguese); a correct file passes with its warning. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const GOOD = `#include "ap_int.h"
#include <stdio.h>
void adder(ap_uint<8> a, ap_uint<8> b, ap_uint<9> *sum) {
  printf("adding\\n");
  *sum = a + b;
}
`;
const BAD = `#include <unistd.h>
int f(int n) {
  int *p = malloc(4);
  return n ? f(n - 1) : 0;
}
`;

uiTest('#1524 Silinx HLS: a .c file in the editor (C highlighting, the checks as lint marks), Check Syntax with the top function, the errors and their help; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CPj', files: { 'src/adder.c': GOOD, 'src/bad.c': BAD } });
  await page.openProject('CPj');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/adder.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/adder.c' && window.Silinx.active.editor);
  // C's highlighting: the keywords and the types
  await page.waitFor(() => document.querySelectorAll('.doc:not([hidden]) .cm-content .tok-keyword, .doc:not([hidden]) .cm-content .tok-type').length > 0, [], { what: 'C highlighting' });
  // the printf warning marked in the editor
  await page.waitForSelector('.doc:not([hidden]) .cm-lint-marker-warning', { timeout: 8000 });
  // Check Syntax: the top function, the warning, success
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" completed successfully with 1 warning\(s\)/);
  const log = await page.consoleText();
  assert.match(log, /Analyzing Silinx HLS file "src\/adder\.c"/);
  assert.match(log, /Top function: adder/);
  assert.match(log, /WARNING:SilinxC - "src\/adder\.c" Line 4: printf is ignored by synthesis \(it only prints in C simulation\)/);
  // the bad file: its errors, each with its help, the editor marking them
  await page.eval(() => window.SilinxApp.openFile('src/bad.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/bad.c' && window.Silinx.active.editor);
  await page.waitForSelector('.doc:not([hidden]) .cm-lint-marker-error', { timeout: 8000 });
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" failed \(4 error\(s\), 0 warning\(s\)\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  const errs = () => page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((d) => ({ text: d.textContent, hint: d.parentElement.querySelector(`.diag-hint`)?.dataset.hint || d.nextElementSibling?.dataset?.hint || null })));
  const e = await errs();
  const lines = e.map((x) => /Line (\d+): (.*?)(?:$|\s{2})/.exec(x.text)?.slice(1, 3).join(' ').replace(/[▸▾].*$/, '').trim());
  assert.deepEqual(lines.map((s) => s.slice(0, 60)), [
    "1 the header 'unistd.h' is not one of Silinx HLS's (ap_int.h, std",
    '2 recursion is not possible in hardware (Silinx HLS, as Vitis HLS',
    "3 the pointer 'p': set to something other than an array, &x, &a[i] or a + i: not supported yet",
    '3 malloc: dynamic memory is not possible in hardware (Silinx HLS,',
  ].map((s) => s.slice(0, 60)));
  // the local pointer's error (core/c-pointer.js since #1599, #1723): its whole message
  assert.equal(lines[2], "3 the pointer 'p': set to something other than an array, &x, &a[i] or a + i: not supported yet");
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag-hint')].map((x) => x.dataset.hint)), ['c-header', 'c-recursion', 'c-pointer-variable', 'c-dynamic-memory']);
  // in Portuguese: the help
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Verificar Sintaxe' });
  await page.waitConsole(/Process "Check Syntax" failed \(4 error\(s\), 0 warning\(s\)\)[\s\S]*Process "Check Syntax" failed \(4 error/);
  await page.waitFor(() => /hardware tem um número fixo de cópias/.test(document.querySelector('#console-errors .diag-hint[data-hint="c-recursion"]')?.textContent || ''), [], { what: 'the help in Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
});
