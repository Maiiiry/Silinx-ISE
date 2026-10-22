// UI: the truth tables' module (#405: web/js/drawings-tt.js out of web/js/drawings.js): a new table opened in its editor,
// its VHDL module made with it and following it (the HDL simulates to the table), a saved edit of the HDL read back
// into the table, and the table's schematic (a view generated from it, no errors in its netlist), with the console's
// lines. The table editor itself, its K-map and its forms: test/ui/truthtable.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { truthTableFromModule } from '../../core/logic.js';
import { netlist } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const T = '.doc:not([hidden]) .tt-editor';
const fileText = (page, p) => page.eval(async (f) => (await fetch(`/api/projects/TtMod/file?path=${encodeURIComponent(f)}`)).text(), p);
const cells = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T);

uiTest('Truth tables\' module: a new table, its HDL following it, an HDL edit read back, its schematic', E, async (page) => {
  await makeProject(env, { name: 'TtMod', files: {} });
  await page.openProject('TtMod');
  await page.menu('Tools', 'Truth Table / Karnaugh Map…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj3');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  for (const r of [3, 5, 6, 7]) await page.click(`${T} .tt-cell[data-out=f][data-row="${r}"]`);
  assert.equal(await cells(page), '00010111');

  // the table -> its VHDL module, linked
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj3.vhd'] === 'src/maj3.tt.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /f = Σm\(3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtMod/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'the HDL follows the table', timeout: 15000 });
  assert.equal(truthTableFromModule([{ path: 'maj3.vhd', text: await readWs(env, 'TtMod', 'src/maj3.vhd') }], 'maj3').table.f, '00010111');
  assert.equal(JSON.parse(await fileText(page, 'src/maj3.tt.json')).generatedFile, 'src/maj3.vhd');
  const lines = (await page.consoleText()).split('\n');
  assert.deepEqual(lines.slice(lines.findIndex((l) => /^Project ".*" opened/.test(l)) + 1), [
    'src/maj3.vhd generated from src/maj3.tt.json (every source has its HDL)',
    "Created Truth Table 'src/maj3.tt.json'.",
  ]);

  // a saved edit of the HDL -> the table
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}f <= .*;/, '    f <= a xor b xor c;')); });
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMod/file?path=src%2Fmaj3.tt.json')).json()).table.f === '01101001', [], { what: 'table updated from the HDL', timeout: 15000 });
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json');
  await page.waitFor((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join('') === '01101001', [T], { what: 'editor updated' });

  // its schematic: a view generated from the table
  await page.eval(() => window.SilinxApp.openTtSchematic('src/maj3.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/maj3.tt.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-sch-bar').textContent), /^Schematic \(read-only\): generated from maj3\.tt\.json$/);
  const sch = await page.eval(() => window.Silinx.active.viewer.getDoc());
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.ok(sch.symbols.length > 0);
});
