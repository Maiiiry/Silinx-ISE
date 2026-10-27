// UI: the schematic editor's Symbols and Properties panels folded and expanded (#1713, web/js/sch-panels.js): by the
// button in their title, a thin strip with their name, expanded again by a click on the strip; remembered when the
// schematic is opened again; the canvas wider; in Portuguese; under 1024 px the narrow screen's panels instead (no
// folding).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

function schematic() {
  const d = newDoc('fold', 'vhdl');
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 200, y: 200 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 500, y: 200 });
  d.wires.push({ id: 'W1', points: [{ x: 200, y: 200 }, { x: 500, y: 200 }] });
  return d;
}
const state = (page) => page.eval((ed) => {
  const e = document.querySelector(ed), w = (s) => Math.round(e.querySelector(s).getBoundingClientRect().width);
  const b = (p) => e.querySelector(`.se-fold[data-fold=${p}]`);
  return {
    folded: ['sym-folded', 'props-folded'].filter((c) => e.classList.contains(c)), left: w('.se-left'), right: w('.se-right'), canvas: w('.se-center'),
    titles: [b('symbols').title, b('props').title], expanded: [b('symbols').getAttribute('aria-expanded'), b('props').getAttribute('aria-expanded')],
    shown: [!!e.querySelector('.se-left .se-lefttools').getClientRects().length, !!e.querySelector('.se-right .se-props').getClientRects().length],
    caps: [...e.querySelectorAll('.se-cap')].slice(0, 2).map((c) => c.textContent.trim().toLowerCase()),
  };
}, ED);

uiTest('#1713 the schematic\'s Symbols and Properties panels fold to a strip and expand; remembered; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FoldSch', files: { 'src/fold.sch.json': JSON.stringify(schematic()) } });
  await page.openProject('FoldSch');
  const open = async () => {
    await page.eval(() => window.SilinxApp.openSch('src/fold.sch.json'));
    await page.waitFor((ed) => window.Silinx.active?.id === 'sch:src/fold.sch.json' && document.querySelector(`${ed} .se-fold`), [ED], { what: 'the schematic editor' });
  };
  await open();
  const s0 = await state(page);
  assert.deepEqual({ ...s0, left: undefined, right: undefined, canvas: undefined }, {
    folded: [], titles: ['Collapse the Symbols panel', 'Collapse the Properties panel'], expanded: ['true', 'true'], shown: [true, true],
    caps: ['symbols', 'properties'], left: undefined, right: undefined, canvas: undefined,
  });
  assert.ok(s0.left > 150 && s0.right > 200, JSON.stringify(s0));
  // both folded by their buttons: strips of 24 px, their names kept, the canvas wider by what they gave
  await page.click(`${ED} .se-fold[data-fold=symbols]`);
  await page.click(`${ED} .se-fold[data-fold=props]`);
  const s1 = await state(page);
  assert.deepEqual({ folded: s1.folded, left: s1.left, right: s1.right, titles: s1.titles, expanded: s1.expanded, shown: s1.shown, caps: s1.caps }, {
    folded: ['sym-folded', 'props-folded'], left: 24, right: 24, titles: ['Expand the Symbols panel', 'Expand the Properties panel'],
    expanded: ['false', 'false'], shown: [false, false], caps: ['symbols', 'properties'],
  });
  assert.ok(Math.abs(s1.canvas - (s0.canvas + s0.left + s0.right - 48)) <= 2, `${s0.canvas} -> ${s1.canvas}`);
  // remembered: the schematic closed and opened again, still folded
  await page.eval(() => window.Silinx.active.close?.() ?? window.SilinxApp.closeDoc?.(window.Silinx.active));
  await page.waitFor(() => window.Silinx.active?.id !== 'sch:src/fold.sch.json', [], { what: 'the schematic closed' });
  await open();
  assert.deepEqual((await state(page)).folded, ['sym-folded', 'props-folded']);
  // a click on the Symbols strip (not on its button) expands it; Properties by its button
  await page.click(`${ED} .se-left .se-cap`, { text: undefined });
  await page.click(`${ED} .se-fold[data-fold=props]`);
  const s2 = await state(page);
  assert.deepEqual([s2.folded, s2.shown, s2.left, s2.right, s2.canvas], [[], [true, true], s0.left, s0.right, s0.canvas]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await state(page)).titles, ['Recolher o painel dos símbolos', 'Recolher o painel das propriedades']);
  await page.click(`${ED} .se-fold[data-fold=symbols]`);
  assert.equal((await state(page)).titles[0], 'Expandir o painel dos símbolos');
  await page.click(`${ED} .se-fold[data-fold=symbols]`);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // under 1024 px: no fold buttons, the toolbar's ☰ Symbols / ☰ Properties
  await page.setViewport(900, 800);
  await page.waitFor((ed) => !document.querySelector(`${ed} .se-fold`).getClientRects().length && document.querySelector(`${ed} [data-panel=symbols]`).getClientRects().length, [ED], { what: 'the narrow screen\'s panels' });
  await page.setViewport(1400, 900);
});
