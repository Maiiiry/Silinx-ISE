// UI: Try it keeps a single-bit wire's width, so it is not confused with a bus (#1552): its colour follows its value,
// its stroke is as wide as outside Try it and narrower than a bus's.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// an AND gate (single-bit wires W1..W3) and a 4-bit adder (bus wires W4..W6), each pin wired to an I/O marker
function schematic() {
  const doc = newDoc('width', 'vhdl');
  let wid = 0;
  const sym = (type, x, y, params = {}) => { const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: `U${doc.symbols.length + 1}`, params }; doc.symbols.push(s); return s; };
  const pin = (s, n) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {}).find((q) => q.name === n);
  const io = (s, n, name, dir, width = 1) => {
    const p = pin(s, n), at = { x: p.x + (dir === 'in' ? -60 : 60), y: p.y };
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name, dir, width, x: at.x, y: at.y });
    doc.wires.push({ id: `W${++wid}`, points: [at, { x: p.x, y: p.y }] });
  };
  const g = sym('and2', 300, 100);
  io(g, 'I0', 'a', 'in'); io(g, 'I1', 'b', 'in'); io(g, 'O', 'y', 'out');
  const ad = sym('add', 300, 300, { width: 4 });
  io(ad, 'A', 'p', 'in', 4); io(ad, 'B', 'n', 'in', 4); io(ad, 'S', 'r', 'out', 4);
  return doc;
}

const ED = '.doc:not([hidden]) .sch-editor';
// a wire's drawn line: its stroke width and colour, and its value class
const line = (page, id) => page.eval((sel, w) => {
  const g = document.querySelector(`${sel} g.wire[data-id="${w}"]`), cs = getComputedStyle(g.querySelector('.wline'));
  return { width: parseFloat(cs.strokeWidth), stroke: cs.stroke, level: [...g.classList].find((c) => c.startsWith('lv-')) || null };
}, ED, id);

uiTest('Try it: a single-bit wire keeps its width, only a bus is thick; the colour follows the value (#1552)', E, async (page) => {
  const doc = schematic();
  await makeProject(env, { name: 'WidthPj', files: { 'src/width.sch.json': JSON.stringify(doc) } });
  await page.openProject('WidthPj');
  await page.eval(() => window.SilinxApp.openSch('src/width.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/width.sch.json' && document.querySelector(`${sel} g.wire[data-id="W4"]`), [ED]);
  const bit = await line(page, 'W1'), bus = await line(page, 'W4');
  assert.ok(bit.width < bus.width, `outside Try it a wire (${bit.width}) is narrower than a bus (${bus.width})`);

  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode') && document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'Try it' });
  const low = await line(page, 'W1');
  assert.equal(low.level, 'lv-0');
  assert.equal(low.width, bit.width, 'a single-bit wire at 0 keeps its width');
  assert.equal(low.stroke, 'rgb(29, 92, 29)', 'a 0 is dark green');
  const tryBus = await line(page, 'W4');
  assert.ok(tryBus.level && tryBus.level !== 'lv-n', `the bus has a value (${tryBus.level})`);
  assert.ok(low.width < tryBus.width, `in Try it a wire (${low.width}) is narrower than a bus (${tryBus.width})`);

  // input a to 1: the wire turns bright green, its width the same
  await page.click(`${ED} .lv-ctl[data-port="${doc.ports.find((p) => p.name === 'a').id}"]`);
  await page.waitFor((sel) => document.querySelector(`${sel} g.wire[data-id="W1"]`).classList.contains('lv-1'), [ED], { what: 'a = 1' });
  const high = await line(page, 'W1');
  assert.equal(high.stroke, 'rgb(0, 200, 0)', 'a 1 is bright green');
  assert.equal(high.width, bit.width, 'a single-bit wire at 1 keeps its width');
  // the output y (a and b, b = 0) stays 0 at the same width
  const y = await line(page, 'W3');
  assert.deepEqual([y.level, y.width], ['lv-0', bit.width]);
});
