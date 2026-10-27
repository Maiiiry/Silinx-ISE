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

const SUM = `#include <stdio.h>
int sum(int a[8], int n) {
  int s = 0;
  for (int i = 0; i < 8; i++) {
#pragma HLS PIPELINE II=1
    if (i < n) s += a[i];
  }
  return s;
}
int main(void) {
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6};
  printf("%d %d\\n", sum(t, 3), sum(t, 8));
  return 0;
}
`;

uiTest('#1531 a C module\'s processes (C Synthesis (HLS)): View C Synthesis Report (the module, its ports, its memories, each loop\'s II), C Simulation and C/RTL Co-simulation, in both views; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CProc', top: 'sum', files: { 'src/sum.c': SUM } });
  await page.openProject('CProc');
  await page.showMessages();
  await page.treeRow('#hier', 'sum');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /C Synthesis Report of 'sum' \(src\/sum\.c, VHDL\)\n\nModule: sequential, ap_ctrl_hs \(ap_clk, ap_rst, ap_start \/ ap_done \/ ap_idle \/ ap_ready\), \d+ states, \d+ register bits\n/);
  assert.match(log, /Ports:\n {2}ap_clk {11}in {4}1 bit\n[\s\S]* {2}a_address0 {7}out {3}3 bits\n {2}a_ce0 {12}out {3}1 bit\n {2}a_q0 {13}in {3}32 bits\n/);
  assert.match(log, /Memories:\n {2}a {16}8 x 32 bits, ap_memory \(outside the module\)\n/);
  assert.match(log, /Loops:\n {2}line 4 {4}8 iterations; II=5, 41 cycles; pipelined, II=1 asked\n/);
  assert.match(log, /WARNING:SilinxC - "src\/sum\.c" line 4: #pragma HLS PIPELINE II=1: II=5 made \(it accesses a memory, an access a state\)/);
  await page.treeRow('#procs', 'C Simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  assert.match(await page.consoleText(), /\n6 19\nmain\(\) returned 0; 2 call\(s\) of 'sum'\./);
  // the Simulation view: the same group
  await page.setView('sim');
  await page.treeRow('#procs', 'C/RTL Co-simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  assert.match(await page.consoleText(), /C\/RTL co-simulation PASS: 2 call\(s\), the same results/);
  await page.setView('impl');
  // in Portuguese: the group and its processes
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((x) => x.textContent.trim()));
  for (const l of ['Síntese de C (HLS)', 'Ver/Editar Fonte C', 'Simulação de C', 'Co-simulação C/RTL', 'Ver Relatório da Síntese de C', 'Ver HDL Gerado']) assert.ok(labels.includes(l), `${l}: ${labels.join(', ')}`);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
