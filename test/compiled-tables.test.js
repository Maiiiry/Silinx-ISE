// A gate-level netlist's irregular logic as lookup tables in the compiled cycle simulator (core/compiled-tables.js,
// #659): the comparisons of a counter with constants, a 7-segment decoder, a state machine's next state; the
// registers those tables feed made words again; the wide comparisons with a constant one equality. Cycle by cycle as
// the event-driven simulator runs the Post-Synthesis Simulation Model; no table makes a combinational loop; a
// table's inputs reordered with its contents; the nets no longer computed not listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffCycles, designOf, rng } from './compiled-diff.js';
import { compileDesign, compileNetlist, CompiledSim, netlistOf } from '../core/compiled-sim.js';
import { coneTables, gateModel, inputOrder } from '../core/compiled-tables.js';
import { yosysNode } from '../core/synth-open-node.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { postSynthesisModels } from '../core/sim-model.js';

const src = (name, text) => [{ path: name, lang: 'verilog', role: 'design', text }];
const ANON = /^_\d+_(\.|$)/;

// a line counter and its sync pulse (x >= 656 && x < 752), a divider's end (a 24-bit equality), a digit counted on it
// and its 7-segment decoder, a state machine reading the inputs and the line counter
const RTL = `module tabs(input clk, input rst, input [1:0] sw, output reg hs = 1, output [6:0] seg, output reg [1:0] st = 0, output tick);
  reg [9:0] x = 0; reg [3:0] d = 0; reg [23:0] c = 0; reg [6:0] s;
  assign tick = c == 24'd700;
  always @(posedge clk) begin
    x <= x == 799 ? 10'd0 : x + 10'd1;
    hs <= ~(x >= 656 && x < 752);
    c <= tick ? 24'd0 : c + 24'd1;
    if (tick) d <= d == 9 ? 4'd0 : d + 4'd1;
    case (st)
      0: if (sw[0]) st <= 1;
      1: if (sw[1]) st <= 2; else if (x == 5) st <= 3;
      2: st <= 0;
      3: if (!sw[0]) st <= 0;
    endcase
    if (rst) st <= 0;
  end
  always @* case (d)
    0: s = 7'h40; 1: s = 7'h79; 2: s = 7'h24; 3: s = 7'h30; 4: s = 7'h19;
    5: s = 7'h12; 6: s = 7'h02; 7: s = 7'h78; 8: s = 7'h00; default: s = 7'h10;
  endcase
  assign seg = s;
endmodule`;
async function model() {
  const synth = await synthesizeOpen(designOf(src('tabs.v', RTL), 'tabs'), { family: 'spartan3e', run: yosysNode });
  return src('tabs_synthesis.v', postSynthesisModels(synth, { top: 'tabs' }).verilog);
}

test('#659 a Post-Synthesis Simulation Model\'s comparisons, decoder and state machine as tables: cycle by cycle as the event-driven simulator, no warnings', { timeout: 120000 }, async () => {
  const sources = await model();
  const design = designOf(sources, 'tabs');
  const raw = await netlistOf(design, { run: yosysNode, words: false });
  const g = gateModel(raw.json, raw.top);
  assert.deepEqual(g.stats, {
    words: { chains: 2, registers: 2, cells: [201, 87] },
    tables: { tables: 9, inputs: 12, words: 15416, outputs: 23, equalities: 2, cells: [87, 36] },
    registers: 2,
  });
  const types = Object.values(g.json.modules[raw.top].cells).map(c => c.type);
  assert.equal(types.filter(t => t === '$mem_v2').length, 9);
  assert.equal(types.filter(t => t === '$eq').length, 2);
  // (no net listed whose bits are no longer computed; those of the design's names all kept)
  const mod = g.json.modules[raw.top], driven = new Set(Object.values(mod.ports).filter(p => p.direction === 'input').flatMap(p => p.bits));
  for (const c of Object.values(mod.cells)) for (const [port, bits] of Object.entries(c.connections)) if (c.port_directions?.[port] === 'output' || (!c.port_directions && /^(Y|Q)$/.test(port))) bits.forEach(b => driven.add(b));
  for (const [name, n] of Object.entries(mod.netnames)) assert.ok(n.bits.every(b => typeof b !== 'number' || driven.has(b)), name);
  for (const [name, n] of Object.entries(raw.json.modules[raw.top].netnames)) if (!n.hide_name && !ANON.test(name)) assert.ok(mod.netnames[name], name);
  // (netlistOf: the same; against the event-driven simulator, a reset seldom)
  const sim = await compileDesign(design, { run: yosysNode });
  assert.deepEqual(sim.warnings, []);
  assert.match(sim.model.code, /m4\[/);
  const r = rng(659);
  const res = await diffCycles(sources, 'tabs', { cycles: 3000, inputs: () => ({ rst: r() < 0.01 ? 1 : 0, sw: Math.floor(r() * 4) }) });
  assert.deepEqual(res.mismatches, []);
  assert.ok(res.bits >= 3000 * 11, `${res.bits} bits compared`);
});

// a netlist of one-bit cells (the inputs a, c, d; the output y): n = ~a read by p = n | (c & d), y = (a ^ p) & a. With
// tables of 2 inputs, n's inputs ({a}) fit in y's table ({a, p}); in one table, y's table would read p, which reads n,
// one of its own outputs: a loop. n is not deeper than p, so it is not put there.
const cell = (type, conn) => ({ type, parameters: { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 1, B_WIDTH: conn.B ? 1 : 0, Y_WIDTH: 1 }, attributes: {}, connections: conn });
const LOOPY = { modules: { t: {
  ports: { a: { direction: 'input', bits: [2] }, c: { direction: 'input', bits: [3] }, d: { direction: 'input', bits: [4] }, y: { direction: 'output', bits: [5] } },
  cells: { n: cell('$not', { A: [2], Y: [6] }), u: cell('$and', { A: [3], B: [4], Y: [7] }), p: cell('$or', { A: [6], B: [7], Y: [8] }), x: cell('$xor', { A: [2], B: [8], Y: [9] }), y: cell('$and', { A: [9], B: [2], Y: [5] }) },
  netnames: { a: { bits: [2] }, c: { bits: [3] }, d: { bits: [4] }, y: { bits: [5] } },
} } };
const values = (json, top, ins, out) => {
  const sim = new CompiledSim(compileNetlist(json, { top }));
  return Array.from({ length: 2 ** ins.length }, (_, v) => { ins.forEach((p, j) => sim.set(p, (v >> j) & 1)); sim.cycle(1); return sim.get(out); });
};
test('#659 no table makes a combinational loop: a cone\'s root joins a table only when deeper than its inputs', () => {
  const t = coneTables(LOOPY, 't', { inputs: 2 });
  assert.deepEqual(t.stats, { tables: 1, inputs: 2, words: 4, outputs: 1, equalities: 0, cells: [5, 4] });
  const types = Object.values(t.json.modules.t.cells).map(c => c.type).sort();
  assert.deepEqual(types, ['$and', '$mem_v2', '$not', '$or']);
  assert.deepEqual(values(t.json, 't', ['a', 'c', 'd'], 'y'), values(LOOPY, 't', ['a', 'c', 'd'], 'y'));
  // (and a combinational loop of the netlist itself: left as it is, compileNetlist's error)
  const loop = structuredClone(LOOPY);
  loop.modules.t.cells.u.connections.A = [5];
  assert.deepEqual(coneTables(loop, 't', { inputs: 2 }).stats.tables, 0);
  assert.throws(() => compileNetlist(loop, { top: 't' }), /combinational loop/);
});

// a table of 3 inputs and 2 outputs read at the bits of a port in another order: inputOrder puts them in the port's
// order, its contents with them; the same values
test('#659 a table\'s inputs in their word\'s order, its contents reordered with them', () => {
  const r = rng(3), init = Array.from({ length: 16 }, () => (r() < 0.5 ? '1' : '0')).join('');
  const rom = { modules: { t: {
    ports: { a: { direction: 'input', bits: [2, 3, 4] }, y: { direction: 'output', bits: [5, 6] } },
    cells: { $tables$1: { type: '$mem_v2', attributes: {},
      parameters: { MEMID: '$tables$1', SIZE: 8, OFFSET: 0, ABITS: 3, WIDTH: 2, INIT: init, RD_PORTS: 1, RD_CLK_ENABLE: '0', RD_CLK_POLARITY: '1', RD_TRANSPARENCY_MASK: '', RD_COLLISION_X_MASK: '', RD_WIDE_CONTINUATION: '0', RD_CE_OVER_SRST: '0', RD_ARST_VALUE: '00', RD_SRST_VALUE: '00', RD_INIT_VALUE: '00', WR_PORTS: 0, WR_CLK_ENABLE: '', WR_CLK_POLARITY: '', WR_PRIORITY_MASK: '', WR_WIDE_CONTINUATION: '' },
      port_directions: { RD_CLK: 'input', RD_EN: 'input', RD_ARST: 'input', RD_SRST: 'input', RD_ADDR: 'input', RD_DATA: 'output', WR_CLK: 'input', WR_EN: 'input', WR_ADDR: 'input', WR_DATA: 'input' },
      connections: { RD_CLK: ['x'], RD_EN: ['1'], RD_ARST: ['0'], RD_SRST: ['0'], RD_ADDR: [4, 2, 3], RD_DATA: [5, 6], WR_CLK: [], WR_EN: [], WR_ADDR: [], WR_DATA: [] } } },
    netnames: { a: { bits: [2, 3, 4] }, y: { bits: [5, 6] } },
  } } };
  const sorted = inputOrder(structuredClone(rom), 't');
  assert.deepEqual(sorted.modules.t.cells.$tables$1.connections.RD_ADDR, [2, 3, 4]);
  assert.notEqual(sorted.modules.t.cells.$tables$1.parameters.INIT, init);
  const all = json => { const sim = new CompiledSim(compileNetlist(json, { top: 't' })); return Array.from({ length: 8 }, (_, v) => { sim.set('a', v); sim.cycle(1); return sim.get('y'); }); };
  assert.deepEqual(all(sorted), all(rom));
  // (the address read in one piece)
  assert.match(compileNetlist(sorted, { top: 't' }).code, /m0\[v0\]/);
});
