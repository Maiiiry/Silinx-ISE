// UI (#1590): a C++ source (.cpp) in the project: a module as a .c one is, its Design row [C++] (the base) and its HDL,
// its C Synthesis (HLS) processes (the C simulation of its test bench with std::cout); Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const SRC = `#include <iostream>
namespace dsp {
  void twice(int x, int &y) { y = 2 * x; }
}
int main() {
  int y = 0;
  dsp::twice(21, y);
  std::cout << "y=" << y << std::endl;
  return y == 42 ? 0 : 1;
}
`;
const row = (page, name) => page.eval((n) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === n);
  return r ? [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`) : null;
}, name);

uiTest('#1590 a C++ source: its Design row [C++] and its HDL, its C Simulation (std::cout); Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CppMod', top: 'twice', files: { 'src/twice.cpp': SRC } });
  await page.openProject('CppMod');
  await page.leftTab('design');
  await page.showMessages();
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'twice'), [], { what: 'the module twice' });
  assert.deepEqual(await row(page, 'twice'), ['C++*', 'VHDL']);
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.lib.modules.get('twice').ports.map((p) => p.name)), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'y', 'y_ap_vld']);
  await page.treeRow('#hier', 'twice');
  await page.treeRow('#procs', 'C Simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  assert.match(await page.consoleText(), /\ny=42\nmain\(\) returned 0; 1 call\(s\) of 'twice'\./);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].some((x) => x.textContent.trim() === 'Simulação de C')));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
