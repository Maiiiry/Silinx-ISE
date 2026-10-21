// UI: the schematic editor's tools (web/js/sch-tools.js, #405: out of mountSchEditor), mounted alone in the page with
// an editor of its own (a real document and netlist) whose actions are recorded: the tool's options, a wire drawn
// (routed square, ending on a pin or a wire, which is split there), a wire between two named nets refused (#754), a
// symbol placed (and a module's ports), a net name attached (its number counted up), an I/O marker added (its direction
// and name from what it is on).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// an inverter U1 at (200, 100) with its output wired 100 to the right (W1); two short wires named a (W2) and b (W3)
const MOUNT = async () => {
  const { mountTools } = await import('/js/sch-tools.js');
  const { normalizeDoc, symbolPins, netlist } = await import('/core/schdoc.js');
  const canvas = document.createElement('div'), optBox = document.createElement('span'), container = document.createElement('div');
  document.body.append(canvas, optBox, container);
  const inv = { id: 'S1', type: 'inv', name: 'U1', x: 200, y: 100 };
  const [I, O] = symbolPins(normalizeDoc({ symbols: [inv] }).symbols[0]);
  let doc = normalizeDoc({ name: 'top', symbols: [inv], wires: [{ id: 'W1', points: [{ x: O.x, y: O.y }, { x: O.x + 100, y: O.y }] },
    { id: 'W2', points: [{ x: 100, y: 400 }, { x: 200, y: 400 }] }, { id: 'W3', points: [{ x: 400, y: 400 }, { x: 500, y: 400 }] }],
  labels: [{ id: 'L1', x: 150, y: 400, net: 'a' }, { id: 'L2', x: 450, y: 400, net: 'b' }] });
  let nl = netlist(doc), sel = new Set(), tool = 'select', placing = null, wireDraw = null;
  const modules = { sub: { name: 'sub', ports: [{ name: 'x', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 4 }] } };
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a.filter((x) => typeof x !== 'object')]); };
  let prompt = '';
  const t = mountTools({ doc: () => doc, nl: () => nl, sel: () => sel, modules: () => modules, view: () => ({ s: 1 }), hoverPin: () => null,
    destroyed: () => false, tool: () => tool, placing: () => placing, wireDraw: () => wireDraw,
    set: (o) => { if ('tool' in o) tool = o.tool; if ('placing' in o) placing = o.placing; if ('wireDraw' in o) wireDraw = o.wireDraw; },
    readOnly: false, canvas, optBox, container,
    edit: (fn) => { fn(); doc = normalizeDoc(doc, { modules }); nl = netlist(doc, { modules }); calls.push(['edit']); },
    flash: (m) => calls.push(['flash', m.slice(0, 40)]), shortNote: (what, [a, b]) => calls.push(['short', what, a, b]), nextId: (p, arr) => `${p}${arr.length + 1}`, nextInstName: () => 'XLXI_9',
    promptBox: async (pt, label, value) => { calls.push(['prompt', label, value]); return prompt; }, renderPalette: () => {}, render: () => {},
    renderOverlay: () => {}, renderProps: () => {}, updateToolbar: () => {}, updateStatus: () => {}, joinByName: async () => true, renamed: rec('renamed') });
  window.__t = { t, calls, I, O, optBox, canvas, state: () => ({ doc, tool, placing, wireDraw, sel: [...sel] }), setPrompt: (v) => { prompt = v; } };
  return true;
};

uiTest('#405 schematic tools: the options of each tool, a wire drawn and its ends, a short refused, a symbol placed', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { t, calls, I, O, optBox, canvas, state } = window.__t;
    const r = {};
    const opts = () => [...optBox.children].map((e) => e.textContent || e.tagName);
    t.setTool('net'); r.net = [opts(), canvas.dataset.tool];
    t.setTool('io'); r.io = opts();
    t.setTool('wire'); r.wire = [opts(), state().tool];
    // a wire from U1's input (its first point on the pin) to a point up and left, then onto W1 (ends there)
    t.wireClick({ x: I.x, y: I.y });
    r.started = state().wireDraw.pts.length;
    t.wireClick({ x: I.x - 60, y: I.y - 40 });
    r.routed = state().wireDraw.pts.map((p) => [p.x - I.x, p.y - I.y]);
    t.wireClick({ x: O.x + 50, y: O.y - 40 });
    t.wireClick({ x: O.x + 50, y: O.y });
    const d = state().doc;
    r.drawn = [state().wireDraw, d.wires.length, calls.splice(0).map((c) => c[0])];
    // W1 split where the wire ended on it (a T-junction)
    r.split = d.wires.filter((w) => w.points.some((p) => p.x === O.x + 50 && p.y === O.y)).length;
    // a wire from net a to net b: refused, said
    t.wireClick({ x: 200, y: 400 }); t.wireClick({ x: 400, y: 400 });
    r.short = [state().doc.wires.length, calls.splice(0)];
    // a symbol: the tool, its options, placed centred and snapped, the tool kept
    t.startPlace({ type: 'and2', params: {} });
    r.place = [state().tool, opts(), state().placing.type];
    t.placeAt({ x: 603, y: 207 });
    const s = state().doc.symbols.find((x) => x.name === 'XLXI_9');
    r.placed = [s.type, s.x % 10, s.y % 10, state().sel];
    // a module: its ports from the project's module
    t.startPlace({ type: 'module', params: { module: 'sub' } });
    r.module = [opts(), state().placing.params.ports.map((p) => `${p.name}:${p.dir}:${p.width}`)];
    t.setTool('select');
    r.select = [state().placing, opts()];
    return r;
  });
  assert.deepEqual(out.net, [['Name:', 'INPUT'], 'net']);
  assert.deepEqual(out.io, ['Name:', 'INPUT', 'Auto directionInputOutputBidirectional']);
  assert.deepEqual(out.wire, [[], 'wire']);
  assert.equal(out.started, 1);
  assert.deepEqual(out.routed, [[0, 0], [-60, 0], [-60, -40]]);
  assert.deepEqual(out.drawn, [null, 5, ['edit']]);
  assert.equal(out.split, 3);   // (W1's two pieces and the new wire)
  assert.deepEqual(out.short, [5, [['short', 'The wire', 'a', 'b']]]);
  assert.deepEqual(out.place, ['place', ['Placing AND2'], 'and2']);
  assert.deepEqual(out.placed, ['and2', 0, 0, []]);
  assert.deepEqual(out.module, [['Placing sub'], ['x:in:1', 'y:out:4']]);
  assert.deepEqual(out.select, [null, []]);
});

uiTest('#405 schematic tools: a net name attached (counted up), an I/O marker on a pin, on a wire, on empty space', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { t, calls, I, O, optBox, state, setPrompt } = window.__t;
    const r = {};
    // Add Net Name with d0 typed: on W1, then on nothing (said)
    t.setTool('net');
    optBox.querySelector('input').value = 'd0';
    await t.netClick({ x: O.x + 30, y: O.y + 2 });
    r.label = state().doc.labels.map((l) => [l.net, l.x - O.x, l.y - O.y]).pop();
    r.next = optBox.querySelector('input').value;
    await t.netClick({ x: 900, y: 900 });
    r.netCalls = calls.splice(0).map((c) => c.join(' '));
    // Add I/O Marker: on U1's input pin (an input, the name asked), on W1's end (an output, its net's name)
    t.setTool('io');
    setPrompt('A');
    await t.ioClick({ x: I.x + 2, y: I.y });
    setPrompt('');
    await t.ioClick({ x: 300, y: 600 });
    r.ports = state().doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}:${p.x - I.x},${p.y - I.y}`);
    r.ioCalls = calls.splice(0).map((c) => c.join(' '));
    // a marker where there is one already
    await t.ioClick({ x: I.x, y: I.y });
    r.again = calls.splice(0).map((c) => c.join(' '));
    return r;
  });
  assert.deepEqual(out.label, ['d0', 30, 0]);
  assert.equal(out.next, 'd1');
  assert.deepEqual(out.netCalls, ['edit', 'flash Click on a wire to attach the net name']);
  assert.deepEqual(out.ports, ['A:in:1:0,0']);
  assert.deepEqual(out.ioCalls, ['prompt Input port name ', 'edit', 'prompt Input port name in1']);
  assert.deepEqual(out.again, ['flash There is already an I/O marker here']);
});
