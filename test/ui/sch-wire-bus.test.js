// UI: a wire drawn as a bus by its net's width only, no "Draw as bus" (#1705): a 4-bit net thick, a 1-bit wire saved
// with the bus flag (an older schematic, an ISE import) thin; a wire's properties, and several wires' together, have
// no "Draw as bus". The common properties: test/schmulti.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const SHIFT = 8;

// a(3:0) -> W1 -> y(3:0); b -> W2 (flagged bus) -> z
function schematic() {
  const d = newDoc('wbus', 'vhdl');
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 4, x: 200, y: 200 }, { id: 'P2', name: 'y', dir: 'out', width: 4, x: 500, y: 200 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 200, y: 400 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 500, y: 400 });
  d.wires.push({ id: 'W1', points: [{ x: 200, y: 200 }, { x: 500, y: 200 }] }, { id: 'W2', points: [{ x: 200, y: 400 }, { x: 500, y: 400 }], bus: true });
  return d;
}

uiTest('#1705 a wire drawn as a bus by its width only; no "Draw as bus" in its properties', E, async (page) => {
  await makeProject(env, { name: 'WireBus', files: { 'src/wbus.sch.json': JSON.stringify(schematic()) } });
  await page.openProject('WireBus');
  await page.eval(() => window.SilinxApp.openSch('src/wbus.sch.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'sch:src/wbus.sch.json' && document.querySelector(`${ed} [data-kind=wire]`), [ED], { what: 'the schematic editor' });
  const drawn = () => page.eval((ed) => Object.fromEntries([...document.querySelectorAll(`${ed} [data-kind=wire]`)].map((g) => [g.dataset.id, g.classList.contains('bus')])), ED);
  assert.deepEqual(await drawn(), { W1: true, W2: false });
  // the 1-bit wire selected: its properties, no Draw as bus
  const props = () => page.eval((ed) => document.querySelector(`${ed} .se-props`).textContent, ED);
  await page.click(`${ED} [data-kind=wire][data-id=W2] .whit`);
  await page.waitFor((ed) => /Wire · net b/.test(document.querySelector(`${ed} .se-props`)?.textContent || ''), [ED], { what: 'the wire\'s properties' });
  assert.doesNotMatch(await props(), /Draw as bus/);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .se-props input[type=checkbox]`).length, ED), 0);
  // the two wires: nothing in common
  await page.click(`${ED} [data-kind=wire][data-id=W1] .whit`, { modifiers: SHIFT });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-kind=wire].sel`).length === 2, [ED], { what: 'both wires selected' });
  assert.doesNotMatch(await props(), /Draw as bus/);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .se-props input[type=checkbox]`).length, ED), 0);
  assert.deepEqual(await drawn(), { W1: true, W2: false });
  // the file not changed by opening it (the flag kept, it just draws nothing)
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W2').bus), true);
});
