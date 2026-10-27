// UI (#1528): the C editor's C Simulation (main() run: its output in the Console) and C/RTL Co-simulation (main()'s
// calls of the top function replayed on its HDL: PASS, the latency of a sequential one; a failing C simulation said);
// the buttons in Portuguese; both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const GCD = `#include <stdio.h>
unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
int main(void) {
  printf("gcd(48, 18) = %u\\n", gcd(48, 18));
  printf("gcd(100, 75) = %u\\n", gcd(100, 75));
  return 0;
}
`;
const BAD = `int f(int a) { return a; }
int main(void) {
  int z = 0;
  return f(1) / z;
}
`;

uiTest('#1528 the C editor: C Simulation (main()\'s output), C/RTL Co-simulation (PASS, the latency); a failing run said; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CSim', top: '', files: { 'src/gcd.c': GCD, 'src/bad.c': BAD } });
  await page.openProject('CSim');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/gcd.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gcd.c' && window.Silinx.active.editor);
  const btn = (t) => page.click('.doc:not([hidden]) .editor-bar .btn', { text: t });
  await btn('C Simulation');
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  let log = await page.consoleText();
  assert.match(log, /Started : "C Simulation" of src\/gcd\.c\.\n[\s\S]*gcd\(48, 18\) = 6\ngcd\(100, 75\) = 25\nmain\(\) returned 0; 2 call\(s\) of 'gcd'\./);
  await btn('C/RTL Co-simulation');
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  log = await page.consoleText();
  assert.match(log, /C simulation: 2 call\(s\) of 'gcd' replayed on its VHDL\.\nLatency: \d+ to \d+ cycles \(average [\d.]+\)\.\n\nC\/RTL co-simulation PASS: 2 call\(s\), the same results/);
  // a C simulation that fails: where and why
  await page.eval(() => window.SilinxApp.openFile('src/bad.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/bad.c' && window.Silinx.active.editor);
  await btn('C Simulation');
  await page.waitConsole(/Process "C Simulation" failed/);
  assert.match(await page.consoleText(), /ERROR:SilinxC - "src\/bad\.c" line 4: division by zero/);
  // in Portuguese: the buttons
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .editor-bar .btn')].some((b) => b.textContent.trim() === 'Simulação de C'), [], { what: 'Portuguese' });
  assert.ok(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .editor-bar .btn')].some((b) => b.textContent.trim() === 'Co-simulação C/RTL')));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
