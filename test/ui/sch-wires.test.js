// UI (#678): a wire drawn in the schematic editor connects at its ends only. Drawn from U1's output to
// the marker y over U2's output pin (where U2's own wire to z starts), it does not join U2's net (no
// net with two drivers); a wire started on its segment makes a T-junction there (a dot, the wire split);
// an inverter dropped with its input on the wire connects to it (#170).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();

uiTest('#678 schematic: a wire drawn over a pin connects at its ends only; a T-junction and a symbol dropped onto it connect', E, async (page) => {
  // U1 at (100, 90): I (100, 100), O (160, 100); U2 at (240, 240): I (240, 250), O (300, 250)
  const doc = newDoc('wires', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 100, 90), inv('S2', 'U2', 240, 240));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: 200, y: 250 },
    { id: 'P3', name: 'y', dir: 'out', width: 1, x: 500, y: 400 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 500, y: 250 },
    { id: 'P5', name: 'w', dir: 'out', width: 1, x: 400, y: 480 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(100, 100)] }, { id: 'W2', points: [P(200, 250), P(240, 250)] }, { id: 'W4', points: [P(300, 250), P(500, 250)] });
  await makeProject(env, { name: 'WiresPj', files: { 'src/wires.sch.json': JSON.stringify(doc) } });
  await page.openProject('WiresPj');
  await page.eval(() => window.SilinxApp.openSch('src/wires.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const dots = () => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .junction`)].map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).sort(), ED);
  const messages = nl => nl.diagnostics.map(d => `${d.severity}: ${d.message}`);

  // Add Wire: from U1.O, a bend at (300, 100), down over U2.O (300, 250) to (300, 400), ended on y
  await page.click(`${ED} .se-btn[data-act=wire]`);
  for (const [x, y] of [[160, 100], [300, 100], [300, 400], [500, 400]]) await page.click(await at(x, y));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 4, [], { what: 'the wire drawn' });
  let d = await getDoc();
  assert.deepEqual(d.wires.at(-1).points, [P(160, 100), P(300, 100), P(300, 400), P(500, 400)]);
  let nl = netlist(d);
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O port:P3', 'S2.I port:P2', 'S2.O port:P4'], 'U2.O and its wire to z stay apart');
  assert.deepEqual(messages(nl), ["warning: I/O marker 'w' is not connected"], 'no second driver');
  assert.deepEqual(await dots(), [], 'no dot where it crosses');

  // a wire started on its segment (400, 400), ended on w: a T-junction, the drawn wire split there
  for (const [x, y] of [[400, 400], [400, 480]]) await page.click(await at(x, y));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 6, [], { what: 'the T drawn' });
  d = await getDoc();
  nl = netlist(d);
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O port:P3 port:P5', 'S2.I port:P2', 'S2.O port:P4']);
  assert.deepEqual(d.wires.filter((w) => w.points.some((p) => p.x === 400 && p.y === 400)).map((w) => w.points.map((p) => `${p.x},${p.y}`).join(' ')).sort(),
    ['160,100 300,100 300,400 400,400', '400,400 400,480', '400,400 500,400']);
  assert.deepEqual(await dots(), ['400,400']);
  assert.deepEqual(messages(nl), [], 'no warnings');

  // an inverter dropped with its input pin on the wire, at (300, 160): connected there, a dot
  await page.key('Escape');
  await page.fill(`${ED} .se-search`, 'INV');
  await page.click(`${ED} .se-symrow`, { text: 'INV' });
  await page.click(await at(330, 160));
  await page.key('Escape');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 3, [], { what: 'placed' });
  d = await getDoc();
  assert.deepEqual([d.symbols[2].x, d.symbols[2].y], [300, 150]);
  nl = netlist(d);
  assert.deepEqual(nets(nl), ['S1.I port:P1', `S1.O ${d.symbols[2].id}.I port:P3 port:P5`, 'S2.I port:P2', 'S2.O port:P4']);
  assert.deepEqual(await dots(), ['300,160', '400,400']);
  assert.deepEqual(messages(nl), [], 'no warnings');
  // saved so: the project file has the same nets
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/WiresPj/file?path=src%2Fwires.sch.json')).text()).symbols.length === 3, [], { what: 'saved' });
  const saved = await page.eval(async () => JSON.parse(await (await fetch('/api/projects/WiresPj/file?path=src%2Fwires.sch.json')).text()));
  assert.deepEqual(nets(netlist(saved)), nets(nl));
});
