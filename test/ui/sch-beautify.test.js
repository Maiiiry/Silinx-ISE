// UI (#1481, #1506): the schematic editor's Beautify button: with a selection, its wires drawn again; without one, the
// whole sheet laid out again (the inputs on the left, the outputs on the right, the wires routed again); one undo step
// each; nothing to do said so; its label, its tooltip and its notes in Portuguese; hidden in a read-only view.
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
const TITLE = 'Beautify: lay the schematic out again, easier to read (the inputs on the left, the outputs on the right, the symbols in the order of the signals, the wires with few bends and crossings); with a selection, only its wires drawn again. The connections stay the same';
const TITLE_PT = 'Embelezar: dispor de novo o esquemático, mais fácil de ler (as entradas à esquerda, as saídas à direita, os símbolos pela ordem dos sinais, os fios com poucas dobras e cruzamentos); com uma seleção, só os seus fios desenhados de novo. As ligações ficam iguais';

// two wires drawn with a detour: a -> y and c -> x, the output marker x on the left of the input c
function design() {
  const doc = newDoc('tidy', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 100 },
    { id: 'P3', name: 'c', dir: 'in', width: 1, x: 400, y: 300 }, { id: 'P4', name: 'x', dir: 'out', width: 1, x: 100, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(150, 100), P(150, 200), P(250, 200), P(250, 100), P(400, 100)] },
    { id: 'W2', points: [P(400, 300), P(300, 300), P(300, 350), P(200, 350), P(200, 300), P(100, 300)] });
  return doc;
}
const DETOUR1 = design().wires[0].points, DETOUR2 = design().wires[1].points;

uiTest('#1481 #1506 schematic: Beautify draws the selected wires again, or lays out the whole sheet; one undo step; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TidyPj', files: { 'src/tidy.sch.json': JSON.stringify(design()) } });
  await page.openProject('TidyPj');
  await page.eval(() => window.SilinxApp.openSch('src/tidy.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 4, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const wires = async () => (await getDoc()).wires.map((w) => w.points);
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  const button = () => page.eval((ed) => { const b = document.querySelector(`${ed} .se-toolbar [data-act=beautify]`); return b && [b.textContent.trim(), b.title, getComputedStyle(b).display !== 'none']; }, ED);
  const BTN = `${ED} .se-toolbar [data-act=beautify]`;
  assert.deepEqual(await button(), ['Beautify', TITLE, true]);
  assert.deepEqual(await wires(), [DETOUR1, DETOUR2]);
  const doc0 = await getDoc();

  // the selection: c -> x's wire clicked (on its first segment), then Beautify: that wire only, nothing else moved
  const at = (p) => page.eval((ed, x, y) => { const l = document.querySelector(`${ed} svg .port`); const q = l.ownerSVGElement.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, p.x, p.y);
  const clickAt = async (p) => { const q = await at(p); await page.mouse('mouseMoved', q.x, q.y); await page.mouse('mousePressed', q.x, q.y); await page.mouse('mouseReleased', q.x, q.y); };
  const select = async () => {
    await clickAt(P(250, 350));
    await page.waitFor((ed) => document.querySelector(`${ed} svg .wire.sel[data-id="W2"]`), [ED], { what: 'W2 selected' });
  };
  await select();
  await page.click(BTN);
  await hint('Beautify: 1 wire drawn again');
  const sel1 = await wires();
  assert.deepEqual(sel1[0], DETOUR1, 'the selected wire only');
  assert.notDeepEqual(sel1[1], DETOUR2);
  assert.deepEqual([sel1[1][0], sel1[1].at(-1)], [P(400, 300), P(100, 300)], 'its ends where they were');
  assert.ok(sel1[1].reduce((n, q, i) => n + (i ? Math.abs(q.x - sel1[1][i - 1].x) + Math.abs(q.y - sel1[1][i - 1].y) : 0), 0) < 600, 'shorter');
  assert.deepEqual((await getDoc()).ports, doc0.ports, 'the markers where they were');

  // no selection (a click on the empty sheet): the whole sheet laid out, the inputs on the left, every wire straight
  const deselect = async () => {
    await clickAt(P(200, 250));
    await page.waitFor((ed) => !document.querySelector(`${ed} svg .sel`), [ED], { what: 'nothing selected' });
  };
  await deselect();
  await page.click(BTN);
  await hint('Beautify: the schematic laid out again');
  const laid = await getDoc();
  const px = (d, n) => d.ports.find((p) => p.name === n);
  assert.ok(px(laid, 'a').x < px(laid, 'y').x && px(laid, 'c').x < px(laid, 'x').x, JSON.stringify(laid.ports));
  assert.deepEqual(laid.wires.map((w) => w.points.length), [2, 2], 'straight');
  const ends = laid.wires.map((w) => [w.points[0], w.points[1]].map((q) => laid.ports.find((p) => p.x === q.x && p.y === q.y)?.name).sort().join('-')).sort();
  assert.deepEqual(ends, ['a-y', 'c-x'], 'the same connections');
  // nothing left to do: said so, no undo step
  await page.click(BTN);
  await hint('Beautify: the schematic is already laid out this way');
  // one undo step each
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires[0].points.length === 6, [], { what: 'undone' });
  assert.deepEqual(await wires(), sel1, 'the whole sheet\'s Beautify undone in one step');
  assert.deepEqual((await getDoc()).ports, doc0.ports);
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor((d) => JSON.stringify(window.Silinx.active.schEditor.getDoc()) === d, [JSON.stringify(doc0)], { what: 'undone' });
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, 'nothing more to undo');
  await page.click(`${ED} [data-act=fit]`);   // (the view was fitted to the sheet laid out)

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((b) => document.querySelector(b)?.textContent.trim() === 'Embelezar', [BTN], { what: 'Portuguese' });
    assert.deepEqual(await button(), ['Embelezar', TITLE_PT, true]);
    await select();
    await page.click(BTN);
    await hint('Embelezar: 1 fio desenhado de novo');
    await page.click(BTN);
    await hint('Embelezar: os fios já estão tão claros quanto possível');
    await deselect();
    await page.click(BTN);
    await hint('Embelezar: esquemático disposto de novo');
    await page.click(BTN);
    await hint('Embelezar: o esquemático já está disposto assim');
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
