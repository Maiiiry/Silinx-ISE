// UI: a change of the target device in Design Properties (#796): the design checked against the new device before
// the change, the user told which modules use a primitive the new family lacks (and its equivalent) and which
// resources exceed the new part; the change still allowed (Change Device), or not made (Cancel); no message for
// a compatible change. In Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, writeWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a Spartan-3E design: two multipliers in 'mac', a block RAM in 'top'
const S3E_DESIGN = `module mac(input clk, input [17:0] a, output [35:0] p);
  MULT18X18SIO #(.AREG(0), .BREG(0), .PREG(0)) m (.A(a), .B(a), .BCIN(18'd0), .CEA(1'b0), .CEB(1'b0), .CEP(1'b0), .CLK(clk), .RSTA(1'b0), .RSTB(1'b0), .RSTP(1'b0), .P(p));
endmodule
module top(input clk, input [17:0] a, output [2:0] q);
  genvar i;
  generate for (i = 0; i < 2; i = i + 1) begin : g
    wire [35:0] p;
    mac u (.clk(clk), .a(a), .p(p));
    assign q[i] = ^p;
  end endgenerate
  wire [7:0] o; wire op;
  RAMB16_S9 r (.CLK(clk), .EN(1'b1), .SSR(1'b0), .WE(a[0]), .ADDR(a[10:0]), .DI(a[8:1]), .DIP(1'b0), .DO(o), .DOP(op));
  assign q[2] = ^o;
endmodule
`;
const S250 = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };

// Design Properties: the family and the part chosen, then OK
async function chooseDevice(page, family, part) {
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await page.eval((f, p) => {
    const sel = (l) => [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === l).nextElementSibling;
    const set = (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); };
    set(sel('Family:'), f);
    set(sel('Device:'), p);
  }, family, part);
  await page.dialogButton('OK');
}
const issues = () => [...document.querySelectorAll('.dlg-overlay .device-change-issues li')].map((li) => li.textContent);
const paragraphs = () => [...document.querySelectorAll('.dlg-overlay .dlg-body p')].map((p) => p.textContent);

uiTest('Design Properties: a Spartan-3E design to a Spartan-6 part: the modules using MULT18X18SIO and RAMB16_S9 named with their equivalents; Change Device changes it, the issues in the console (#796)', E, async (page) => {
  await makeProject(env, { name: 'DevS6', device: S250, files: { 'src/top.v': S3E_DESIGN }, top: 'top' });
  await page.openProject('DevS6');
  await chooseDevice(page, 'spartan6', 'xc6slx4');
  await page.waitDialog('Device Change');
  assert.deepEqual(await page.eval(issues), [
    "Module 'mac' uses MULT18X18SIO, which the Spartan-6 family does not have: use DSP48A1 instead.",
    "Module 'top' uses RAMB16_S9, which the Spartan-6 family does not have: use RAMB16BWER instead."]);
  assert.deepEqual(await page.eval(paragraphs), ['The design, as it is, does not fit the XC6SLX4:',
    'The device can still be changed: change the design (or choose another device) before running the flow.']);
  await page.dialogButton('Change Device');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.device.part === 'xc6slx4', [], { what: 'the device changed' });
  const log = (await page.consoleText()).split('\n');
  assert.deepEqual(log.filter((l) => /WARNING/.test(l)), [
    "WARNING: XC6SLX4: Module 'mac' uses MULT18X18SIO, which the Spartan-6 family does not have: use DSP48A1 instead.",
    "WARNING: XC6SLX4: Module 'top' uses RAMB16_S9, which the Spartan-6 family does not have: use RAMB16BWER instead."]);
});

uiTest('Design Properties: a smaller part than the last synthesis needs: the block RAMs over its count said; Cancel keeps the device; in Portuguese too (#796)', E, async (page) => {
  await makeProject(env, { name: 'DevSmall', device: S250, files: { 'src/top.v': S3E_DESIGN }, top: 'top' });
  // the last synthesis (the Silinx toolchain's report): 5 block RAMs on the XC3S250E
  await writeWs(env, 'DevSmall', 'build/reports.json', JSON.stringify({ source: 'open', top: 'top', synthesis: { utilization: [
    { id: 'ramb16', name: 'Number of RAMB16s', used: 5, total: 12, percent: 42 }, { id: 'mult18x18', name: 'Number of MULT18X18SIOs', used: 2, total: 12, percent: 17 }] },
  summary: { synthesized: true } }));
  await page.openProject('DevSmall');
  await chooseDevice(page, 'spartan3e', 'xc3s100e');
  await page.waitDialog('Device Change');
  assert.deepEqual(await page.eval(issues), ['5 block RAMs needed, the XC3S100E has 4.']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.project.device.part), 'xc3s250e');
  assert.doesNotMatch(await page.consoleText(), /WARNING/);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.eval(() => { import('/js/wizards.js').then((w) => w.projectProperties()); });
    await page.waitDialog();
    await page.eval(() => {
      const sel = [...document.querySelectorAll('.dlg-overlay select')];
      const part = sel.find((s) => [...s.options].some((o) => o.value === 'xc3s100e'));
      part.value = 'xc3s100e'; part.dispatchEvent(new Event('change'));
    });
    await page.eval(() => document.querySelector('.dlg-overlay .dlg-buttons .btn.primary, .dlg-overlay .dlg-buttons .btn').click());
    await page.waitDialog('Mudança de Dispositivo');
    assert.deepEqual(await page.eval(issues), ['O projeto precisa de 5 RAMs de bloco, o XC3S100E tem 4.']);
    assert.deepEqual(await page.eval(paragraphs), ['O projeto, tal como está, não cabe no XC3S100E:',
      'O dispositivo pode ser mudado na mesma: altere o projeto (ou escolha outro dispositivo) antes de executar o fluxo.']);
    await page.dialogButton('Mudar o Dispositivo');
    await page.waitNoDialog();
    await page.waitFor(() => window.Silinx.project?.device.part === 'xc3s100e', [], { what: 'the device changed' });
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

uiTest('Design Properties: a compatible change (blinky to the XC3S500E): no message, the device changed (#796)', E, async (page) => {
  await makeProject(env, { name: 'DevOk', template: 'blinky', device: S250 });
  await page.openProject('DevOk');
  await chooseDevice(page, 'spartan3e', 'xc3s500e');
  await page.waitFor(() => window.Silinx.project?.device.part === 'xc3s500e', [], { what: 'the device changed' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .device-change-issues')), null);
  assert.doesNotMatch(await page.consoleText(), /WARNING/);
});
