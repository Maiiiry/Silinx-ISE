// UI: where a schematic's paste goes (#1797, core/schclip.js pasteOffset): Ctrl+V with the mouse on the sheet, the copy
// centred on the pointer; Edit ▸ Paste with the mouse off the sheet, in a blank place of the part in view,
// clear of what is drawn; no warnings either way. The placement itself: test/schclip.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, netlist, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const CTRL = process.platform === 'darwin' ? 4 : 2;

// a ── U1 ── y: an inverter between two markers
function schematic() {
  const doc = normalizeDoc({ ...newDoc('pp', 'vhdl'), symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, name: 'U1' }],
    ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 120, y: 110 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 340, y: 110 }] });
  const pin = (n) => { const p = symbolPins(doc.symbols[0]).find((q) => q.name === n); return { x: p.x, y: p.y }; };
  doc.wires.push({ id: 'W1', points: [{ x: 120, y: 110 }, pin('I')] }, { id: 'W2', points: [pin('O'), { x: 340, y: 110 }] });
  return doc;
}
// sheet <-> screen through the drawing's transform
const toScreen = (page, x, y) => page.eval((ed, x, y) => { const m = document.querySelector(`${ed} .se-vp`).getScreenCTM(); return { x: m.a * x + m.e, y: m.d * y + m.f }; }, ED, x, y);
const view = (page) => page.eval((ed) => {
  const vp = document.querySelector(`${ed} .se-vp`), m = vp.getScreenCTM(), r = vp.ownerSVGElement.getBoundingClientRect();
  return { x: (r.left - m.e) / m.a, y: (r.top - m.f) / m.d, w: r.width / m.a, h: r.height / m.d };
}, ED);
const doc = (page) => page.eval(() => window.Silinx.active.schEditor.getDoc());

uiTest('#1797 paste: at the mouse on the sheet (Ctrl+V); else in a blank place in view (Edit ▸ Paste)', E, async (page) => {
  await makeProject(env, { name: 'PastePlace', files: { 'src/pp.sch.json': JSON.stringify(schematic()) } });
  await page.openProject('PastePlace');
  await page.eval(() => window.SilinxApp.openSch('src/pp.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'the schematic' });
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('a', { modifiers: CTRL });
  await page.key('c', { modifiers: CTRL });
  // the mouse on a blank spot of the sheet in view (below and right of the inverter): Ctrl+V centres the copy there
  const v0 = await view(page);
  const tx = Math.round((v0.x + v0.w * 0.65) / 10) * 10, ty = Math.round((v0.y + v0.h * 0.8) / 10) * 10;
  assert.ok(ty > 160, `below the inverter: ${JSON.stringify(v0)}`);
  const p = await toScreen(page, tx, ty);
  await page.mouse('mouseMoved', p.x, p.y);
  await page.key('v', { modifiers: CTRL });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'pasted at the mouse' });
  let d = await doc(page);
  const c1 = d.ports.filter((q) => /_1$/.test(q.name)).map((q) => q.x);
  const u = d.symbols.find((s) => s.name !== 'U1');
  assert.deepEqual(c1.length, 2);
  assert.ok(Math.abs((Math.min(...c1) + Math.max(...c1)) / 2 - tx) <= 20 && Math.abs(u.y + 10 - ty) <= 20, `centred on (${tx}, ${ty}): ${JSON.stringify([c1, u.x, u.y])}`);
  // the mouse off the sheet (on the status bar), Edit ▸ Paste: in view, clear of the two copies already there
  const off = await page.eval((ed) => { const r = document.querySelector(`${ed} .se-status`).getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; }, ED);
  await page.mouse('mouseMoved', off.x, off.y);
  await page.menu('Edit', 'Paste');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'pasted from the menu' });
  d = await doc(page);
  const v = await view(page);
  const third = d.symbols.find((s) => !['U1', u.name].includes(s.name));
  assert.ok(third.x >= v.x && third.x <= v.x + v.w && third.y >= v.y && third.y <= v.y + v.h, `in view ${JSON.stringify(v)}: ${third.x}, ${third.y}`);
  assert.ok(Math.abs(third.y - 100) >= 40 && Math.abs(third.y - u.y) >= 40 || Math.abs(third.x - 200) >= 200, `clear of the others: ${JSON.stringify(d.symbols.map((s) => [s.x, s.y]))}`);
  // three chains, none touching another: no warnings
  assert.deepEqual(netlist(normalizeDoc(d)).diagnostics.map((x) => `${x.severity}: ${x.message}`), []);
});
