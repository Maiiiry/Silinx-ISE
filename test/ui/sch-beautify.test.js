// UI (#1481): the schematic editor's Beautify button draws the wires again, easier to read: the selected ones when
// there is a selection, otherwise the whole sheet; one undo step each; nothing to do said so; its label, its tooltip
// and its notes in Portuguese; hidden in a read-only view.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const TITLE = 'Beautify: draw the wires again, easier to read (fewer bends and crossings, none through a symbol), the selected ones or the whole sheet; the symbols and the connections stay the same';
const TITLE_PT = 'Embelezar: desenhar de novo os fios, mais fáceis de ler (menos dobras e cruzamentos, nenhum através de um símbolo), os selecionados ou a folha toda; os símbolos e as ligações ficam iguais';

// two wires drawn with a detour: a -> y and c -> x
function design() {
  const doc = newDoc('tidy', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 100 },
    { id: 'P3', name: 'c', dir: 'in', width: 1, x: 100, y: 300 }, { id: 'P4', name: 'x', dir: 'out', width: 1, x: 400, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(150, 100), P(150, 200), P(250, 200), P(250, 100), P(400, 100)] },
    { id: 'W2', points: [P(100, 300), P(200, 300), P(200, 350), P(300, 350), P(300, 300), P(400, 300)] });
  return doc;
}
const DETOUR1 = design().wires[0].points, DETOUR2 = design().wires[1].points;
const STRAIGHT1 = [P(100, 100), P(400, 100)], STRAIGHT2 = [P(100, 300), P(400, 300)];

uiTest('#1481 schematic: Beautify draws the selected wires again, or the whole sheet; one undo step; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TidyPj', files: { 'src/tidy.sch.json': JSON.stringify(design()) } });
  await page.openProject('TidyPj');
  await page.eval(() => window.SilinxApp.openSch('src/tidy.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 4, [ED], { what: 'drawn' });
  const wires = () => page.eval(() => window.Silinx.active.schEditor.getDoc().wires.map((w) => w.points));
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  const button = () => page.eval((ed) => { const b = document.querySelector(`${ed} .se-toolbar [data-act=beautify]`); return b && [b.textContent.trim(), b.title, getComputedStyle(b).display !== 'none']; }, ED);
  const BTN = `${ED} .se-toolbar [data-act=beautify]`;
  assert.deepEqual(await button(), ['Beautify', TITLE, true]);
  assert.deepEqual(await wires(), [DETOUR1, DETOUR2]);

  // the selection: c -> x's wire clicked (on its first segment), then Beautify: that wire only
  const at = (p) => page.eval((ed, x, y) => { const l = document.querySelector(`${ed} svg .port`); const q = l.ownerSVGElement.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, p.x, p.y);
  const clickAt = async (p) => { const q = await at(p); await page.mouse('mouseMoved', q.x, q.y); await page.mouse('mousePressed', q.x, q.y); await page.mouse('mouseReleased', q.x, q.y); };
  await clickAt(P(150, 300));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .wire.sel[data-id="W2"]`), [ED], { what: 'W2 selected' });
  await page.click(BTN);
  await hint('Beautify: 1 wire drawn again');
  assert.deepEqual(await wires(), [DETOUR1, STRAIGHT2], 'the selected wire only');

  // no selection (a click on the empty sheet): the whole sheet
  await clickAt(P(250, 250));
  await page.waitFor((ed) => !document.querySelector(`${ed} svg .sel`), [ED], { what: 'nothing selected' });
  await page.click(BTN);
  await hint('Beautify: 1 wire drawn again');
  assert.deepEqual(await wires(), [STRAIGHT1, STRAIGHT2]);
  // nothing left to do: said so, no undo step
  await page.click(BTN);
  await hint('Beautify: the wires are already as clear as they can be');
  // one undo step each
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires[0].points.length === 6, [], { what: 'undone' });
  assert.deepEqual(await wires(), [DETOUR1, STRAIGHT2], 'the whole sheet\'s Beautify undone in one step');
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires[1].points.length === 6, [], { what: 'undone' });
  assert.deepEqual(await wires(), [DETOUR1, DETOUR2]);
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'nothing more to undo');

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((b) => document.querySelector(b)?.textContent.trim() === 'Embelezar', [BTN], { what: 'Portuguese' });
    assert.deepEqual(await button(), ['Embelezar', TITLE_PT, true]);
    await page.click(BTN);
    await hint('Embelezar: 2 fios desenhados de novo');
    assert.deepEqual(await wires(), [STRAIGHT1, STRAIGHT2]);
    await page.click(BTN);
    await hint('Embelezar: os fios já estão tão claros quanto possível');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

uiTest('#1481 schematic: a read-only view (RTL schematic) has no Beautify button', E, async (page) => {
  await makeProject(env, { name: 'TidyRoPj', files: { 'src/tidy.sch.json': JSON.stringify(design()) } });
  await page.openProject('TidyRoPj');
  // a read-only editor mounted on its own, as the RTL view mounts it
  const shown = await page.eval(async () => {
    const { mountSchEditor } = await import('/js/sch-editor.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:500px';
    document.body.append(host);
    const ed = mountSchEditor(host, { readOnly: true });
    const b = host.querySelector('.se-toolbar [data-act=beautify]');
    const r = !!b && getComputedStyle(b).display !== 'none';
    ed.destroy(); host.remove();
    return r;
  });
  assert.equal(shown, false);
});
