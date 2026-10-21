// UI: the Design Summary's Device Utilization before an implementation: the target part's resources from
// the device model (core/resources.js, #790), the family's own and their counts, in English and Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the utilization table's rows: [resource, available]
const UTILIZATION = () => {
  const t = [...document.querySelectorAll('.summary-table')].find((x) => /^(Device Utilization Summary|Resumo da Utilização do Dispositivo)/.test(x.querySelector('caption')?.textContent || ''));
  return t ? [...t.querySelectorAll('tr')].slice(1).map((r) => [r.cells[0].textContent, r.cells[2].textContent]) : null;
};

const shown = async (page, name) => {
  await page.openProject(name);
  await page.waitFor(() => window.SilinxApp.findDoc('summary') && document.querySelector('.summary-table caption'));
  return page.eval(UTILIZATION);
};

uiTest('Design Summary, not yet implemented: a Spartan-3E part\'s resources, its 24 global clock buffers, in Portuguese too (#790)', E, async (page) => {
  await makeProject(env, { name: 'ResS3e', template: 'blinky', board: 'basys2', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } });
  assert.deepEqual(await shown(page, 'ResS3e'), [['Number of Slice Flip Flops', '4896'], ['Number of 4 input LUTs', '4896'], ['Number of occupied Slices', '2448'],
    ['Number of bonded IOBs', '92'], ['Number of RAMB16s', '12'], ['Number of MULT18X18SIOs', '12'], ['Number of BUFGMUXs', '24'], ['Number of DCMs', '4']]);
  assert.ok(await page.eval(() => [...document.querySelectorAll('.summary-table caption')].some((c) => c.textContent === 'Device Utilization Summary (not yet implemented)')));
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => /Número de BUFGMUXs/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'the summary in Portuguese' });
    const pt = await page.eval(UTILIZATION);
    assert.deepEqual(pt.map((r) => r[0]), ['Número de Slice Flip Flops', 'Número de 4 input LUTs', 'Número de occupied Slices', 'Número de bonded IOBs',
      'Número de RAMB16s', 'Número de MULT18X18SIOs', 'Número de BUFGMUXs', 'Número de DCMs']);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

uiTest('Design Summary, not yet implemented: a Spartan-6 part\'s own resources (block RAM halves, DSP, PLL, BUFIO2, BUFH, MCB), none of the Spartan-3E\'s (#790)', E, async (page) => {
  await makeProject(env, { name: 'ResS6', template: 'blinky', board: 'nexys3' });
  assert.deepEqual(await shown(page, 'ResS6'), [['Number of Slice Registers', '18224'], ['Number of Slice LUTs', '9112'], ['Number of occupied Slices', '2278'],
    ['Number of bonded IOBs', '232'], ['Number of RAMB16BWERs', '32'], ['Number of RAMB8BWERs', '64'], ['Number of DSP48A1s', '32'],
    ['Number of BUFG/BUFGMUXs', '16'], ['Number of BUFIO2/BUFIO2_2CLKs', '32'], ['Number of BUFHs', '128'], ['Number of DCM/DCM_CLKGENs', '4'],
    ['Number of PLL_ADVs', '2'], ['Number of MCBs', '2']]);
});
