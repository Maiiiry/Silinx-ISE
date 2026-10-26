// UI: a gate wider than one bit (AND, INV, BUFE…) shows its width at its input and output pins, as the other symbols
// (a constant, an adder), and nothing inside its shape; a one-bit gate none; the same in the dark theme and in the
// printed SVG (#1486).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, waitDownload } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

uiTest('#1486 schematic: a bus-wide AND and INV show their width at their pins, not inside the gate; one bit, none', E, async (page) => {
  const doc = newDoc('gw', 'vhdl');
  const add = (id, type, x, y, params) => doc.symbols.push({ id, type, x, y, rot: 0, mirror: false, name: `XLXI_${id}`, params });
  add('A8', 'and2', 100, 60, { width: 8 }); add('N4', 'inv', 300, 60, { width: 4 }); add('A1', 'and2', 100, 200, { width: 1 });
  add('T8', 'tbuf', 300, 200, { width: 8, enable: 'T' }); add('K4', 'constant', 500, 60, { value: '5', width: 4 });
  await makeProject(env, { name: 'GateW', files: { 'src/gw.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('GateW');
  await page.eval(() => window.SilinxApp.openSch('src/gw.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .se-svg g.sym`).length === 5, [ED], { what: 'the symbols drawn' });
  // each symbol's widths, and whether one of its texts but the type sits inside its shape
  const drawn = () => page.eval((ed) => Object.fromEntries([...document.querySelectorAll(`${ed} .se-svg g.sym`)].map((g) => {
    const shape = [...g.querySelectorAll('.gate')].map((e) => e.getBoundingClientRect());
    const inside = (r) => shape.some((b) => r.left + r.width / 2 > b.left && r.left + r.width / 2 < b.right && r.top + r.height / 2 > b.top && r.top + r.height / 2 < b.bottom);
    const texts = [...g.querySelectorAll('text')].filter((t) => !t.classList.contains('stype'));
    return [g.dataset.id, { widths: [...g.querySelectorAll('.pwidth')].map((t) => t.textContent), inside: texts.filter((t) => inside(t.getBoundingClientRect())).map((t) => t.textContent) }];
  })), ED);
  const expected = {
    A8: { widths: ['8', '8', '8'], inside: [] }, N4: { widths: ['4', '4'], inside: [] }, A1: { widths: [], inside: [] },
    T8: { widths: ['8', '8'], inside: [] }, K4: { widths: ['4'], inside: [] },
  };
  assert.deepEqual(await drawn(), expected);
  // in the style of the other symbols' widths (the constant's), in the light and the dark theme
  const style = () => page.eval((ed) => ['A8', 'N4', 'T8', 'K4'].map((id) => {
    const cs = getComputedStyle(document.querySelector(`${ed} .se-svg g.sym[data-id="${id}"] .pwidth`));
    return [cs.fill, cs.stroke, cs.fontSize].join(' ');
  }), ED);
  const light = await style();
  assert.equal(new Set(light).size, 1, light.join(' | '));
  const theme = await page.eval(() => document.documentElement.dataset.theme);
  await page.eval(() => { document.documentElement.dataset.theme = 'dark'; });
  const dark = await style();
  assert.equal(new Set(dark).size, 1, dark.join(' | '));
  assert.deepEqual(await drawn(), expected);
  await page.eval((t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }, theme);
  // printed: the SVG saved from the print preview has the gates' widths at their pins too
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — Schematic');
  await page.dialogButton('Save SVG');
  const fs = await import('node:fs/promises');
  const svg = await fs.readFile(await waitDownload(page, 'Schematic_src_gw.sch.json.svg'), 'utf8');
  // (its texts' styles inlined: the widths the 8 px ones, each 10 px in from its pin's end)
  const widths = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size:8px[^>]*>([^<]*)</g)].map((m) => `${m[3]} at ${m[1]},${m[2]}`);
  assert.deepEqual(widths, ['8 at 110,73', '8 at 110,93', '8 at 170,83', '4 at 310,73', '4 at 350,73', '8 at 310,233', '8 at 350,233', '4 at 530,73']);
  await page.key('Escape');
});
