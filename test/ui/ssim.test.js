// UI: the simulator's name is SSim, the Silinx Simulator (#920; ISim, Xilinx's, is ISE's): the Processes pane, the
// New Project summary, the simulation's tab, its console's first line and prompt, in English and Portuguese; the
// console's ssim force, and isim force, its old name, still a command. (A session saved with the simulation open, its
// 'isim:' document as before, comes back as SSim: test/ui/app.test.js, #163.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const procLabels = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].filter((l) => l.getClientRects().length).map((l) => l.textContent.trim()));
const consoleLines = (page) => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-console .isim-ln')].map((d) => `${d.className.replace(/^isim-ln\s*/, '')}|${d.textContent}`));

uiTest('#920 SSim: the Processes pane, the simulation\'s tab, its console and prompt; ssim force and isim force; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SSimPj', template: 'blinky' });
  await page.openProject('SSimPj');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'SSim Simulator', { exact: true });
  assert.ok(!(await procLabels(page)).some((l) => /ISim/.test(l)), (await procLabels(page)).join());
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running
    && /Sim Time: 1,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || ''), [], { what: 'SSim\'s first run', timeout: 30000 });
  assert.equal(await page.eval(() => window.Silinx.active.title), 'SSim (tb_top)');
  assert.match(await page.consoleText(), /Launching SSim view\./);
  const lines = await consoleLines(page);
  assert.equal(lines[0], 'k-info|SSim (Silinx behavioural simulator)');
  // the simulation's messages: no warnings, no errors
  assert.deepEqual(lines.filter((l) => /^k-(warning|error|failure)\|/.test(l)), []);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-cmdline span').textContent), 'SSim>');
  // ssim force, and isim force (its old name), both force the signal; the commands echoed after SSim>
  const command = async (cmd) => {
    await page.click('#mc-cmd input');   // (SSim's command line: the bottom console's, #925)
    await page.type(cmd);
    await page.key('Enter');
    await page.waitFor((c) => [...document.querySelectorAll('.doc:not([hidden]) .isim-ln')].some((d) => d.textContent === `SSim> ${c}`), [cmd], { what: cmd });
    await page.waitFor(() => !window.Silinx.active.view.state.running, [], { what: `${cmd} done` });
  };
  for (const [cmd, v] of [['ssim force add /tb_top/sw 1010 -radix bin', '1010'], ['isim force add /tb_top/sw C -radix hex', '1100']]) {
    await command(cmd);
    await command('run 10 ns');
    await command('show value /tb_top/sw -radix bin');
    await page.waitFor(() => /^SSim> show value/.test([...document.querySelectorAll('.doc:not([hidden]) .isim-ln')].at(-2)?.textContent || ''), [], { what: 'the value shown' });
    assert.equal(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-ln')].at(-1).textContent), v, cmd);
  }
  assert.deepEqual((await consoleLines(page)).filter((l) => /^k-(warning|error|failure)\|/.test(l)), []);
  // Portuguese: the process, the prompt (SSim's own)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('#left-tabs .tab[data-page=design]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulador SSim', { exact: true });
  assert.ok(!(await procLabels(page)).some((l) => /ISim/.test(l)), (await procLabels(page)).join());
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

uiTest('#920 SSim: the New Project wizard\'s simulator and summary, in English and Portuguese', E, async (page) => {
  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    await page.menu(lang === 'en' ? 'File' : 'Ficheiro', lang === 'en' ? 'New Project…' : 'Novo Projeto…');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main input[type=text]'), [], { what: 'the wizard' });
    await page.fill('.dlg-overlay .wiz-main input[type=text]', `SSimWiz_${lang}`);
    await page.dialogButton(lang === 'en' ? 'Next >' : 'Seguinte >');
    await page.waitFor(() => document.querySelectorAll('.dlg-overlay .wiz-main select').length > 8, [], { what: 'Project Settings' });
    const options = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main select option')].map((o) => o.textContent).filter((t) => /Sim/.test(t)));
    assert.deepEqual(options, [lang === 'en' ? 'SSim (VHDL/Verilog; Silinx Simulator)' : 'SSim (VHDL/Verilog; Simulador Silinx)']);
    await page.dialogButton(lang === 'en' ? 'Next >' : 'Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main pre'), [], { what: 'Project Summary' });
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main pre').textContent), /Simulator: {10}SSim \(Silinx behavioural simulator\)\n/);
    await page.dialogButton(lang === 'en' ? 'Cancel' : 'Cancelar');
    await page.waitNoDialog();
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
