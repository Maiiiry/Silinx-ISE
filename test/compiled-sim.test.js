// Compiled cycle simulator (core/compiled-sim.js, #384): the design as one JavaScript function per
// clock cycle, checked cycle by cycle against the event-driven simulator (test/compiled-diff.js) on the
// examples and on test designs (Verilog and VHDL) exercising every cell, at the widths where the code
// changes (numbers up to 32 bits, BigInts above; `wide`: every value a BigInt, the same results); the
// cells Yosys makes only from other netlists against a reference computed here; the errors; the speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EXAMPLES, example, ROOT } from './examples-lib.mjs';
import { diffCycles, designOf, rng } from './compiled-diff.js';
import { compileDesign, compileNetlist, CompiledSim, CompileError, netlistOf, portBit, segmentsOf } from '../core/compiled-sim.js';
import { yosysNode } from '../core/synth-open-node.js';
import { timingGenerics, autoTimeScale, scaledGenerics } from '../core/emulate.js';

const FIX = path.join(ROOT, 'test/fixtures/compiled-sim');
const fixture = name => [{ path: name, lang: name.endsWith('.vhd') ? 'vhdl' : 'verilog', role: 'design', text: fs.readFileSync(path.join(FIX, name), 'utf8') }];
const src = (name, text) => [{ path: name, lang: name.endsWith('.vhd') ? 'vhdl' : 'verilog', role: 'design', text }];

// random inputs: each input port changes with probability p in a cycle (all of them in cycle 0)
function randomInputs(sources, top, { seed = 1, p = 1, generics } = {}) {
  const ins = designOf(sources, top, { generics }).top.ports.filter(x => x.dir === 'in');
  const r = rng(seed), cur = {};
  const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
  return k => { for (const x of ins) if (k === 0 || r() < p) cur[x.name] = word(x.sig.t.w); return cur; };
}
async function same(sources, top, o = {}) {
  for (const wide of [false, true]) {
    const r = await diffCycles(sources, top, { cycles: 400, nets: true, inputs: randomInputs(sources, top, o), wide, ...o });
    assert.deepEqual(r.mismatches, [], `${top}${wide ? ' (wide)' : ''}`);
    assert.ok(r.bits >= (o.minBits ?? 10000), `${top}: ${r.bits} bits compared`);
  }
}

// ------------------------------------------------------------------ the examples
for (const name of EXAMPLES) {
  test(`example ${name}: the compiled simulator computes what the event-driven one does, cycle by cycle`, async () => {
    const ex = example(name);
    // (its timing generics divided further than the emulator does, so that its counters wrap)
    const gens = timingGenerics(designOf(ex.design, ex.project.top).top.params);
    const generics = gens.length ? scaledGenerics(gens, autoTimeScale(gens) * 100) : undefined;
    const sim = await compileDesign(designOf(ex.design, ex.project.top, { generics }), { run: yosysNode });
    assert.deepEqual(sim.warnings, []);
    assert.equal(sim.model.clock?.port, name === 'gates' ? undefined : 'clk');
    for (const wide of [false, true]) {
      const r = await diffCycles(ex.design, ex.project.top, { cycles: 3000, generics, nets: true, wide, inputs: randomInputs(ex.design, ex.project.top, { generics, p: 0.01, seed: 7 }) });
      assert.deepEqual(r.mismatches, [], wide ? 'wide' : '');
      assert.ok(r.bits > 50000, `${r.bits} bits compared`);
    }
  });
}

// ------------------------------------------------------------------ the open synthesis's test designs (test/fixtures/designs)
const DESIGNS = path.join(ROOT, 'test/fixtures/designs');
// (their warnings, or why they are not compiled: an inout port)
const FIXTURES = {
  adder: [], blinky: [], bram_dp: [], bram_sp: [], cpu8: [], dram: [], fsm: [], mult: [], srl: [],
  latch: ["latch inferred for 'l3'", "latch inferred for 'l2'", "latch inferred for 'l1'"],
  bram_prim: [], bufgmux: [], dcm: [],
  tristate: { error: "the inout port 'io' (a tristate) cannot be compiled" },
};
test('the test designs are all listed', () => {
  assert.deepEqual(fs.readdirSync(DESIGNS).sort(), Object.keys(FIXTURES).sort());
});
for (const [name, want] of Object.entries(FIXTURES)) {
  test(`test design ${name}: ${want.error ? 'not compiled, with the reason' : 'the compiled simulator computes what the event-driven one does'}`, async () => {
    const dir = path.join(DESIGNS, name);
    const spec = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'));
    const sources = spec.files.map(f => ({ path: f, lang: /\.vhd$/.test(f) ? 'vhdl' : 'verilog', role: 'design', text: fs.readFileSync(path.join(dir, f), 'utf8') }));
    if (want.error) {
      await assert.rejects(compileDesign(designOf(sources, spec.top), { run: yosysNode }), { name: 'Error', message: want.error });
      return;
    }
    const sim = await compileDesign(designOf(sources, spec.top), { run: yosysNode, clock: spec.sim.clock });
    assert.deepEqual(sim.warnings, want);
    const ins = designOf(sources, spec.top).top.ports.filter(x => x.dir === 'in');
    const r = rng(9), cur = {}, prob = spec.sim.prob || {};
    const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
    const res = await diffCycles(sources, spec.top, { cycles: spec.sim.cycles || 600, nets: true, clock: spec.sim.clock,
      inputs: k => { for (const x of ins) if (k === 0 || r() < (prob[x.name] ?? 0.5)) cur[x.name] = word(x.sig.t.w); return cur; } });
    assert.deepEqual(res.mismatches, []);
    assert.ok(res.bits >= 4000, `${res.bits} bits compared`);
  });
}

// ------------------------------------------------------------------ test designs, through Silinx's synthesis Verilog
test('operators: unsigned and signed, 1 to 64 bits, shifts, comparisons, reductions, a case, an array (Verilog)', async () => {
  await same(fixture('ops.v'), 'ops');
});
test('registers: synchronous / asynchronous resets, enables, set / clear, a falling edge, a latch, 40 bits (Verilog)', async () => {
  const sim = await compileDesign(designOf(fixture('regs.v'), 'regs'), { run: yosysNode });
  assert.deepEqual(sim.warnings, ["latch inferred for 'lat'", "Complex async reset for dff 'q_sr'."]);
  assert.equal(sim.model.stats.bothEdges, true);
  await same(fixture('regs.v'), 'regs', { p: 0.3 });
});
test('clocks: a counter bit as a clock, a ripple counter, a clock on an input, a gated and an inverted clock (Verilog)', async () => {
  const sim = await compileDesign(designOf(fixture('clocks.v'), 'clocks'), { run: yosysNode });
  assert.equal(sim.model.clock.port, 'clk');
  assert.equal(sim.model.stats.clocks, 7);
  await same(fixture('clocks.v'), 'clocks', { p: 0.3, clock: 'clk' });
});
test('memories: synchronous and asynchronous reads, a registered address, a ROM, 40-bit words (Verilog)', async () => {
  await same(fixture('mems.v'), 'mems', { p: 0.3 });
});
test('numeric_std arithmetic, shifts, a ROM, a RAM, an asynchronous reset, an enumeration, an integer counter (VHDL)', async () => {
  await same(fixture('ops.vhd'), 'ops_vhd', { p: 0.5 });
});
test('the cells of Verilog read by Yosys itself: $shiftx, $shift, $sshl, $eqx, $dffe, $sdff, $sdffe, $sdffce, $adffe, $aldff, a memory read port with a reset', async () => {
  await same(fixture('cells.v'), 'cells', { p: 0.4, direct: true, extra: 'opt_dff' });
});

// ------------------------------------------------------------------ the Xilinx primitives (#429)
test('Xilinx primitives in VHDL: block RAMs of mixed widths and every write mode, the multipliers, SRL16s, distributed RAMs, BUFGCE_1, BUFGMUX_1', async () => {
  const sim = await compileDesign(designOf(fixture('prims.vhd'), 'prims_vhd'), { run: yosysNode });
  assert.deepEqual(sim.warnings, []);
  assert.equal(sim.model.stats.memories, 10);
  await same(fixture('prims.vhd'), 'prims_vhd', { p: 0.3, cycles: 1000 });
});
test('Xilinx primitives in Verilog: block RAMs, MULT18X18SIO, SRL16_1 / SRL16E_1 / SRLC16E, distributed RAMs, BUFGCE, BUFGMUX', async () => {
  const sim = await compileDesign(designOf(fixture('prims.v'), 'prims_v'), { run: yosysNode });
  assert.deepEqual(sim.warnings, []);
  await same(fixture('prims.v'), 'prims_v', { p: 0.3, cycles: 1000 });
});
// the logic of a synthesized netlist (the Post-Synthesis Simulation Model, #561): every LUT (random INITs), flip-flop,
// latch and carry-chain cell, in VHDL (UNISIM, as the model's netlist) and in Verilog, its inputs from a random word
const LOGIC_FFS = ['FD', 'FDC', 'FDCE', 'FDE', 'FDP', 'FDPE', 'FDR', 'FDRE', 'FDS', 'FDSE', 'FDRS', 'FDRSE', 'FDCP', 'FDCPE'];
const LOGIC_LATCHES = ['LD', 'LDC', 'LDCE', 'LDE', 'LDP', 'LDPE'];
function logicPrims(lang) {
  const r = rng(561), cells = [];
  const bits = n => Array.from({ length: n }, () => (r() < 0.5 ? '1' : '0')).join('');
  for (let n = 1; n <= 6; n++) for (const v of ['', '_L', '_D']) cells.push([`LUT${n}${v}`, { INIT: bits(2 ** n) }, Array.from({ length: n }, (_, i) => `I${i}`), v === '_L' ? ['LO'] : v === '_D' ? ['O', 'LO'] : ['O']]);
  for (const [b, ins] of [['MUXCY', ['CI', 'DI', 'S']], ['MUXF5', ['I0', 'I1', 'S']], ['MUXF6', ['I0', 'I1', 'S']], ['MUXF7', ['I0', 'I1', 'S']], ['MUXF8', ['I0', 'I1', 'S']], ['XORCY', ['CI', 'LI']]]) {
    for (const v of ['', '_L', '_D']) cells.push([`${b}${v}`, {}, ins, v === '_L' ? ['LO'] : v === '_D' ? ['O', 'LO'] : ['O']]);
  }
  cells.push(['MULT_AND', {}, ['I0', 'I1'], ['LO']]);
  // (the flip-flops and latches twice: their default INIT and the other one)
  const pins = n => (/CP/.test(n) ? ['CLR', 'PRE'] : /C/.test(n.slice(2)) ? ['CLR'] : /P/.test(n.slice(2)) ? ['PRE'] : []);
  for (const f of LOGIC_FFS) for (const e of ['', '_1']) for (const init of [null, '1', '0']) {
    if (init === (['FDP', 'FDPE', 'FDS', 'FDSE'].includes(f) ? '1' : '0')) continue;
    const sync = [...(/E$/.test(f) ? ['CE'] : []), ...(/^FDR/.test(f) ? ['R'] : []), ...(/^FD(R?S)/.test(f) ? ['S'] : [])];
    cells.push([`${f}${e}`, init ? { INIT: init } : {}, ['C', ...pins(f), ...sync, 'D'], ['Q']]);
  }
  for (const l of LOGIC_LATCHES) for (const e of ['', '_1']) for (const init of [null, l.startsWith('LDP') ? '0' : '1']) {
    cells.push([`${l}${e}`, init ? { INIT: init } : {}, ['G', ...pins(l), ...(/E$/.test(l) ? ['GE'] : []), 'D'], ['Q']]);
  }
  let a = 0, y = 0;
  const W = 24, insts = [];
  for (const [cell, params, ins, outs] of cells) {
    const conn = [...ins.map(p => [p, p === 'C' ? 'clk' : lang === 'vhdl' ? `a(${a++ % W})` : `a[${a++ % W}]`]), ...outs.map(p => [p, lang === 'vhdl' ? `y(${y})` : `y[${y++}]`])];
    if (lang === 'vhdl') {
      outs.forEach(() => y++);
      let k = y - outs.length;
      const map = conn.map(([p, s]) => `${p} => ${outs.includes(p) ? `y(${k++})` : s}`).join(', ');
      const gen = params.INIT ? ` generic map (INIT => ${params.INIT.length > 1 ? `"${params.INIT}"` : `'${params.INIT}'`})` : '';
      insts.push(`  u${insts.length}: ${cell}${gen} port map (${map});`);
    } else {
      const gen = params.INIT ? ` #(.INIT(${params.INIT.length}'b${params.INIT}))` : '';
      insts.push(`  ${cell}${gen} u${insts.length} (${conn.map(([p, s]) => `.${p}(${s})`).join(', ')});`);
    }
  }
  return lang === 'vhdl'
    ? src('logic.vhd', `library IEEE; use IEEE.STD_LOGIC_1164.ALL;\nlibrary UNISIM; use UNISIM.VCOMPONENTS.ALL;
entity logic_vhd is port (clk : in std_logic; a : in std_logic_vector(${W - 1} downto 0); y : out std_logic_vector(${y - 1} downto 0)); end;
architecture n of logic_vhd is begin\n${insts.join('\n')}\nend;`)
    : src('logic.v', `module logic_v(input clk, input [${W - 1}:0] a, output [${y - 1}:0] y);\n${insts.join('\n')}\nendmodule`);
}
test('Xilinx primitives of a synthesized netlist: every LUT, flip-flop, latch, MUXCY, MUXF, XORCY and MULT_AND, in VHDL and in Verilog (#561)', async () => {
  for (const [lang, top] of [['vhdl', 'logic_vhd'], ['verilog', 'logic_v']]) {
    const sources = logicPrims(lang);
    const sim = await compileDesign(designOf(sources, top), { run: yosysNode });
    assert.deepEqual(sim.warnings, [], lang);
    await same(sources, top, { p: 0.3, cycles: 1000, minBits: 100000 });
  }
});
test('a block RAM in a sub-module: its INIT_xx / INITP_xx contents (written into the netlist after Yosys)', async () => {
  const text = `module rom(input clk, input [10:0] a, output [8:0] q);
    RAMB16_S9 #(.INIT_00(256'h00000000000000000000000000000000000000000000000000000000CAFE1234), .INIT_3F(256'hAB${'0'.repeat(62)}),
      .INITP_00(256'h5), .INITP_07(256'h8${'0'.repeat(63)})) r (.CLK(clk), .ADDR(a), .DI(8'd0), .DIP(1'b0), .EN(1'b1), .WE(1'b0), .SSR(1'b0), .DO(q[7:0]), .DOP(q[8]));
  endmodule
  module top2(input clk, input [10:0] a, output [8:0] q); rom u (.clk(clk), .a(a), .q(q)); endmodule`;
  const s = await compileDesign(designOf(src('top2.v', text), 'top2'), { run: yosysNode });
  // (the byte, its parity bit above it)
  for (const [a, want] of [[0, 0x134], [1, 0x012], [2, 0x1FE], [3, 0x0CA], [4, 0], [2047, 0x1AB], [2046, 0]]) {
    s.set('a', a);
    s.cycle(1);
    assert.equal(s.get('q'), BigInt(want), `address ${a}`);
  }
});
// DCMs: the frequencies (CLKDV_DIVIDE twice, as an integer generic), the input divided by 2
const DCM_SETS = [{}, { DIV2: true }, { DV2: 8, FXM: 2, FXD: 1 }, { DV2: 3, FXM: 7, FXD: 5, DIV2: true }, { DV2: 11, FXM: 2, FXD: 32 }, { DV2: 32, FXM: 31, FXD: 29 }];
test('a DCM_SP: every output (CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX / FX180), both edges, LOCKED, at several frequencies (VHDL)', async () => {
  for (const generics of DCM_SETS) {
    const sim = await compileDesign(designOf(fixture('dcm.vhd'), 'dcm_vhd', { generics }), { run: yosysNode });
    assert.deepEqual(sim.warnings, []);
    assert.equal(sim.model.clock.port, 'clk');
    await same(fixture('dcm.vhd'), 'dcm_vhd', { p: 0.2, generics, cycles: 300 });
  }
});
test('two cascaded DCMs, a BUFGMUX between their clocks, a BUFGCE (Verilog)', async () => {
  const sim = await compileDesign(designOf(fixture('dcm.v'), 'dcm_v'), { run: yosysNode });
  assert.deepEqual(sim.warnings, []);
  assert.equal(sim.model.stats.dcms, 2);
  await same(fixture('dcm.v'), 'dcm_v', { p: 0.1 });
});
test('a DCM\'s clocks against their arithmetic: the rising edges of CLKFX, CLKDV and CLK2X from the 4th input edge, CLK0 and LOCKED from the 3rd', async () => {
  const text = (fx, dv, div2) => `module f(input clk, output lk, output reg [31:0] n0 = 0, nfx = 0, ndv = 0, n2x = 0, nlk = 0);
    wire c0, cfx, cdv, c2x;
    DCM_SP #(.CLKFX_MULTIPLY(${fx[0]}), .CLKFX_DIVIDE(${fx[1]}), .CLKDV_DIVIDE(${dv}), .CLKIN_DIVIDE_BY_2("${div2 ? 'TRUE' : 'FALSE'}"))
      u (.CLKIN(clk), .RST(1'b0), .CLK0(c0), .CLKFX(cfx), .CLKDV(cdv), .CLK2X(c2x), .LOCKED(lk));
    always @(posedge c0) n0 <= n0 + 1;
    always @(posedge cfx) nfx <= nfx + 1;
    always @(posedge cdv) ndv <= ndv + 1;
    always @(posedge c2x) n2x <= n2x + 1;
    always @(posedge clk) nlk <= nlk + lk;
  endmodule`;
  // edges at s, s + q, s + 2q… before the end of cycle n (the main clock's rising edges at 0, 1, 2…)
  const edges = (n, s, q) => (n <= s ? 0 : Math.ceil((n - s) / q));
  for (const [fx, dv, div2] of [[[5, 3], 1.5, false], [[2, 4], 4.0, false], [[3, 1], 2.5, true], [[7, 32], 16.0, true]]) {
    const s = await compileDesign(designOf(src('f.v', text(fx, dv, div2)), 'f'), { run: yosysNode });
    const pin = div2 ? 2 : 1;
    for (const n of [1, 2, 3, 4, 5, 37, 1000, 10007]) {
      s.cycle(n - s.cycles);
      const what = `CLKFX ${fx.join('/')}, CLKDV ${dv}${div2 ? ', CLKIN / 2' : ''}, ${n} cycles`;
      assert.equal(s.get('lk'), n >= 3 ? 1n : 0n, `LOCKED, ${what}`);
      assert.equal(s.get('nlk'), BigInt(Math.max(0, n - 3)), `LOCKED seen by the main clock, ${what}`);
      assert.equal(s.get('n0'), BigInt(div2 ? edges(n, 3, 2) : edges(n, 2, 1)), `CLK0, ${what}`);
      assert.equal(s.get('nfx'), BigInt(edges(n, 3, pin * fx[1] / fx[0])), `CLKFX, ${what}`);
      assert.equal(s.get('ndv'), BigInt(edges(n, 3, pin * dv)), `CLKDV, ${what}`);
      assert.equal(s.get('n2x'), BigInt(edges(n, 3, pin / 2)), `CLK2X, ${what}`);
    }
  }
});
// DCMs with their RST driven (#465): reset at random cycles, from an input and from a register
test('two DCM_SPs reset by the design, from an input and from a register of the main clock: every output but CLK90 / CLK270, at several frequencies (VHDL)', async () => {
  for (const generics of DCM_SETS) {
    const sim = await compileDesign(designOf(fixture('dcm_rst.vhd'), 'dcm_rst_vhd', { generics }), { run: yosysNode });
    assert.deepEqual(sim.warnings, []);
    assert.equal(sim.model.stats.dcms, 2);
    await same(fixture('dcm_rst.vhd'), 'dcm_rst_vhd', { p: 0.1, generics, cycles: 300 });
  }
});
test('a DCM reset by an active-low button, another by a register of the first one\'s CLKDV, a BUFGCE of a reset DCM\'s clock (Verilog)', async () => {
  const sim = await compileDesign(designOf(fixture('dcm_rst.v'), 'dcm_rst_v'), { run: yosysNode });
  assert.deepEqual(sim.warnings, []);
  assert.equal(sim.model.stats.dcms, 2);
  await same(fixture('dcm_rst.v'), 'dcm_rst_v', { p: 0.1 });
});
test('a DCM\'s reset against the arithmetic: its clocks stopped and LOCKED low while RST is high, the lock sequence again from the release', async () => {
  const text = `module f(input clk, r, output lk, output reg [31:0] n0 = 0, nfx = 0, ndv = 0, n2x = 0);
    wire c0, cfx, cdv, c2x;
    DCM_SP #(.CLKFX_MULTIPLY(5), .CLKFX_DIVIDE(3), .CLKDV_DIVIDE(2.5)) u (.CLKIN(clk), .RST(r), .CLK0(c0), .CLKFX(cfx), .CLKDV(cdv), .CLK2X(c2x), .LOCKED(lk));
    always @(posedge c0) n0 <= n0 + 1;
    always @(posedge cfx) nfx <= nfx + 1;
    always @(posedge cdv) ndv <= ndv + 1;
    always @(posedge c2x) n2x <= n2x + 1;
  endmodule`;
  const edges = (n, s, q) => (n <= s ? 0 : Math.ceil((n - s) / q));
  const count = n => ({ n0: edges(n, 2, 1), nfx: edges(n, 3, 3 / 5), ndv: edges(n, 3, 2.5), n2x: edges(n, 3, 0.5) });
  const s = await compileDesign(designOf(src('f.v', text), 'f'), { run: yosysNode });
  // (RST high from the start: never locked; then released, reset again after 1, 3, 4 and 37 cycles)
  s.set('r', 1);
  s.cycle(5);
  const at = { n0: 0, nfx: 0, ndv: 0, n2x: 0 };
  for (const run of [41, 1, 3, 4, 37]) {
    s.set('r', 0);
    for (let m = 1; m <= run; m++) {
      s.cycle(1);
      assert.equal(s.get('lk'), m >= 3 ? 1n : 0n, `LOCKED, ${m} cycles after the release`);
      for (const [k, v] of Object.entries(count(m))) assert.equal(s.get(k), BigInt(at[k] + v), `${k}, ${m} cycles after the release`);
    }
    for (const [k, v] of Object.entries(count(run))) at[k] += v;
    s.set('r', 1);
    s.cycle(1);
    assert.equal(s.get('lk'), 0n);
    s.cycle(6);
    for (const k of Object.keys(at)) assert.equal(s.get(k), BigInt(at[k]), `${k} held in reset`);
  }
});
test('a DCM with what the board shows counted (watch): sampled once a main clock cycle, before its rising edge (RST tied, and reset by the design)', async () => {
  // (the reset: a register of the main clock, high 4 cycles out of 32)
  for (const rst of ["1'b0", 'k[4] & k[3]']) {
    const text = `module w(input clk, output reg t = 0); wire dv; reg [4:0] k = 0; always @(posedge clk) k <= k + 1;
      DCM_SP #(.CLKDV_DIVIDE(3.0)) u (.CLKIN(clk), .RST(${rst}), .CLKDV(dv));
      always @(posedge dv) t <= ~t; endmodule`;
    const { json } = await netlistOf(designOf(src('w.v', text), 'w'), { run: yosysNode });
    const bit = portBit(json, 'w', 't');
    const ref = new CompiledSim(compileNetlist(json, { top: 'w' }));
    const s = new CompiledSim(compileNetlist(json, { top: 'w', clock: 'clk', watch: { levels: [{ bit, on: 1 }], edges: [{ bit, capture: [bit] }] } }));
    // (the reference: t before each rising edge, cycle by cycle, the first sample and the one after the last
    // edge counted half; its falling edges: the cycles before which it is 0 after a 1)
    let high = 0, prev = null;
    const falls = [];
    for (let k = 0; k < 600; k++) {
      const t = ref.get('t');
      if (t) high += k === 0 ? 0.5 : 1;
      if (prev === 1n && t === 0n) falls.push(k);
      prev = t;
      ref.cycle(1);
  }
  if (ref.get('t')) high += 0.5;
  s.cycle(600);
  const { counts, edges } = s.take();
  assert.equal(counts[0], high);
  assert.deepEqual(edges.filter((_, i) => i % 2 === 0), falls);
  assert.ok(falls.length > 50, rst);
  }
});

test('the comparison finds a wrong compiled model', async () => {
  // the state machine's count down (st - 1) made a count up
  const r = await diffCycles(fixture('ops.v'), 'ops', { cycles: 400, inputs: randomInputs(fixture('ops.v'), 'ops'), mutate: code => code.replace(/\(v(\d+) - 1\)/, '(v$1 + 1)') });
  assert.ok(r.mismatches.length > 0);
  assert.equal(r.mismatches[0].port, 'st');
});

// ------------------------------------------------------------------ cells against a reference computed here
// a module of one cell: its inputs (the widths given) as input ports, Y / Q the output
const bin = (n, w = 32) => BigInt.asUintN(w, BigInt(n)).toString(2).padStart(w, '0');
function oneCell(type, params, widths) {
  let next = 2;
  const ports = {}, conn = {};
  for (const [p, w] of Object.entries(widths)) {
    const bits = Array.from({ length: w }, () => next++);
    conn[p] = bits;
    ports[p] = { direction: p === 'Y' || p === 'Q' ? 'output' : 'input', bits };
  }
  const P = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v : bin(v)]));
  return { modules: { t: { attributes: { top: '00000000000000000000000000000001' }, ports, cells: { c: { type, parameters: P, port_directions: {}, connections: conn } }, netnames: {} } } };
}
const sgn = (v, w) => BigInt.asIntN(w, v);
const floorDiv = (a, b) => { const q = a / b; return (a % b !== 0n) && ((a < 0n) !== (b < 0n)) ? q - 1n : q; };
const floorMod = (a, b) => { const r = a % b; return r !== 0n && (r < 0n) !== (b < 0n) ? r + b : r; };
const CELLS = [
  // [type, params, widths, reference(A, B, S) -> Y]
  ['$divfloor', { A_SIGNED: 1, B_SIGNED: 1, A_WIDTH: 12, B_WIDTH: 6, Y_WIDTH: 12 }, { A: 12, B: 6, Y: 12 }, (a, b) => (b ? floorDiv(sgn(a, 12), sgn(b, 6)) : 0n)],
  ['$modfloor', { A_SIGNED: 1, B_SIGNED: 1, A_WIDTH: 12, B_WIDTH: 6, Y_WIDTH: 6 }, { A: 12, B: 6, Y: 6 }, (a, b) => (b ? floorMod(sgn(a, 12), sgn(b, 6)) : 0n)],
  ['$divfloor', { A_SIGNED: 1, B_SIGNED: 1, A_WIDTH: 40, B_WIDTH: 20, Y_WIDTH: 40 }, { A: 40, B: 20, Y: 40 }, (a, b) => (b ? floorDiv(sgn(a, 40), sgn(b, 20)) : 0n)],
  ['$modfloor', { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 40, B_WIDTH: 20, Y_WIDTH: 20 }, { A: 40, B: 20, Y: 20 }, (a, b) => (b ? a % b : 0n)],
  ['$lut', { WIDTH: 4, LUT: '1001011001101001' }, { A: 4, Y: 1 }, a => (0b1001011001101001n >> a) & 1n],
  ['$lut', { WIDTH: 6, LUT: '1'.repeat(20) + '0'.repeat(30) + '10'.repeat(7) }, { A: 6, Y: 1 }, a => (BigInt(`0b${'1'.repeat(20)}${'0'.repeat(30)}${'10'.repeat(7)}`) >> a) & 1n],
  ['$bwmux', { WIDTH: 33 }, { A: 33, B: 33, S: 33, Y: 33 }, (a, b, s) => (a & ~s & ((1n << 33n) - 1n)) | (b & s)],
  ['$bwmux', { WIDTH: 32 }, { A: 32, B: 32, S: 32, Y: 32 }, (a, b, s) => (a & ~s & 0xFFFFFFFFn) | (b & s)],
  ['$bmux', { WIDTH: 5, S_WIDTH: 2 }, { A: 20, S: 2, Y: 5 }, (a, b, s) => (a >> (s * 5n)) & 31n],
  ['$bmux', { WIDTH: 12, S_WIDTH: 3 }, { A: 96, S: 3, Y: 12 }, (a, b, s) => (a >> (s * 12n)) & 4095n],
  ['$demux', { WIDTH: 6, S_WIDTH: 2 }, { A: 6, S: 2, Y: 24 }, (a, b, s) => a << (s * 6n)],
  ['$demux', { WIDTH: 9, S_WIDTH: 3 }, { A: 9, S: 3, Y: 72 }, (a, b, s) => a << (s * 9n)],
  ['$nex', { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 33, B_WIDTH: 3, Y_WIDTH: 1 }, { A: 33, B: 3, Y: 1 }, (a, b) => (a !== b ? 1n : 0n)],
  ['$reduce_and', { A_SIGNED: 0, A_WIDTH: 32, Y_WIDTH: 2 }, { A: 32, Y: 2 }, a => (a === 0xFFFFFFFFn ? 1n : 0n)],
  ['$pos', { A_SIGNED: 1, A_WIDTH: 7, Y_WIDTH: 40 }, { A: 7, Y: 40 }, a => BigInt.asUintN(40, sgn(a, 7))],
  ['$shift', { A_SIGNED: 0, B_SIGNED: 1, A_WIDTH: 16, B_WIDTH: 6, Y_WIDTH: 16 }, { A: 16, B: 6, Y: 16 }, (a, b) => { const s = sgn(b, 6); return BigInt.asUintN(16, s < 0n ? a << -s : a >> s); }],
  ['$sshr', { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 20, B_WIDTH: 5, Y_WIDTH: 12 }, { A: 20, B: 5, Y: 12 }, (a, b) => BigInt.asUintN(12, a >> b)],
  ['$shr', { A_SIGNED: 1, B_SIGNED: 0, A_WIDTH: 8, B_WIDTH: 4, Y_WIDTH: 16 }, { A: 8, B: 4, Y: 16 }, (a, b) => BigInt.asUintN(16, BigInt.asUintN(16, sgn(a, 8)) >> b)],
];
test('the cells Silinx\'s Verilog does not make ($divfloor, $modfloor, $lut, $bwmux, $bmux, $demux…) against a reference', () => {
  for (const [type, params, widths, ref] of CELLS) {
    for (const wide of [false, true]) {
      const sim = new CompiledSim(compileNetlist(oneCell(type, params, widths), { top: 't', wide }));
      const r = rng(11);
      const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
      for (let k = 0; k < 300; k++) {
        const v = { A: word(widths.A), B: widths.B ? word(widths.B) : 0n, S: widths.S ? word(widths.S) : 0n };
        if (k === 0) Object.assign(v, { A: 0n, B: 0n, S: 0n });
        if (k === 1) Object.assign(v, { A: (1n << BigInt(widths.A)) - 1n, B: widths.B ? (1n << BigInt(widths.B)) - 1n : 0n });
        for (const p of ['A', 'B', 'S']) if (widths[p]) sim.set(p, v[p]);
        sim.cycle(0);
        const want = BigInt.asUintN(widths.Y, ref(v.A, v.B, v.S));
        assert.equal(sim.get('Y'), want, `${type} ${JSON.stringify(widths)}${wide ? ' (wide)' : ''}: A=${v.A} B=${v.B} S=${v.S}`);
      }
    }
  }
});

// a register cell clocked by C (the main clock), its other pins inputs
function oneReg(type, params, widths) {
  return oneCell(type, params, { CLK: 1, ...widths });
}
test('$dffsre, $aldffe and $adlatch against a reference', () => {
  const r = rng(13);
  // $dffsre: per bit, CLR over SET over the clocked value (enabled); SET / CLR active low here
  {
    const sim = new CompiledSim(compileNetlist(oneReg('$dffsre', { WIDTH: 6, CLK_POLARITY: '1', EN_POLARITY: '1', SET_POLARITY: '0', CLR_POLARITY: '0' }, { D: 6, EN: 1, SET: 6, CLR: 6, Q: 6 }), { top: 't' }));
    let q = 0n;
    for (let k = 0; k < 300; k++) {
      const d = BigInt(Math.floor(r() * 64)), en = BigInt(r() < 0.5), set = BigInt(Math.floor(r() * 64)) | 0b110000n, clr = BigInt(Math.floor(r() * 64)) | 0b001100n;
      for (const [p, v] of Object.entries({ D: d, EN: en, SET: set, CLR: clr })) sim.set(p, v);
      const sA = ~set & 63n, cA = ~clr & 63n;
      sim.cycle(1);
      q = ((en ? d : q) | sA) & ~cA & 63n;
      assert.equal(sim.get('Q'), q, `cycle ${k}`);
    }
  }
  // $aldffe: an asynchronous load of AD over the enabled clocked value
  {
    const sim = new CompiledSim(compileNetlist(oneReg('$aldffe', { WIDTH: 40, CLK_POLARITY: '1', EN_POLARITY: '0', ALOAD_POLARITY: '1' }, { D: 40, AD: 40, EN: 1, ALOAD: 1, Q: 40 }), { top: 't' }));
    let q = 0n;
    for (let k = 0; k < 300; k++) {
      const d = BigInt(Math.floor(r() * 2 ** 40)), ad = BigInt(Math.floor(r() * 2 ** 40)), en = BigInt(r() < 0.5), al = BigInt(r() < 0.3);
      for (const [p, v] of Object.entries({ D: d, AD: ad, EN: en, ALOAD: al })) sim.set(p, v);
      sim.cycle(0);
      if (al) q = ad;
      assert.equal(sim.get('Q'), q, `cycle ${k}, before the edge`);
      sim.cycle(1);
      q = al ? ad : !en ? d : q;
      assert.equal(sim.get('Q'), q, `cycle ${k}`);
    }
  }
  // $adlatch: transparent while EN, reset while ARST (over EN)
  {
    const sim = new CompiledSim(compileNetlist(oneCell('$adlatch', { WIDTH: 8, EN_POLARITY: '1', ARST_POLARITY: '1', ARST_VALUE: '10100101' }, { D: 8, EN: 1, ARST: 1, Q: 8 }), { top: 't' }));
    let q = 0n;
    for (let k = 0; k < 300; k++) {
      const d = BigInt(Math.floor(r() * 256)), en = BigInt(r() < 0.5), arst = BigInt(r() < 0.2);
      for (const [p, v] of Object.entries({ D: d, EN: en, ARST: arst })) sim.set(p, v);
      sim.cycle(0);
      q = arst ? 0xA5n : en ? d : q;
      assert.equal(sim.get('Q'), q, `step ${k}`);
    }
  }
});

test('a memory\'s synchronous read ports: enable, synchronous and asynchronous resets, transparency, against a reference', () => {
  // 8 words of 6 bits; port 0 read-first, its resets over its enable; port 1 transparent to the write port,
  // its enable over its reset (RD_CE_OVER_SRST)
  let next = 2;
  const ports = {};
  const port = (name, w, dir = 'input') => { ports[name] = { direction: dir, bits: Array.from({ length: w }, () => next++) }; return ports[name].bits; };
  const clk = port('CLK', 1), wa = port('WA', 3), wd = port('WD', 6), we = port('WE', 6), ra0 = port('RA0', 3), ra1 = port('RA1', 3);
  const en0 = port('EN0', 1), en1 = port('EN1', 1), sr0 = port('SR0', 1), sr1 = port('SR1', 1), ar0 = port('AR0', 1);
  const q0 = port('Q0', 6, 'output'), q1 = port('Q1', 6, 'output');
  const P = { WIDTH: bin(6), SIZE: bin(8), ABITS: bin(3), OFFSET: bin(0), INIT: '010101'.repeat(8), MEMID: '\\m', RD_PORTS: bin(2), WR_PORTS: bin(1),
    RD_CLK_ENABLE: '11', RD_CLK_POLARITY: '11', RD_TRANSPARENCY_MASK: '10', RD_COLLISION_X_MASK: '00', RD_CE_OVER_SRST: '10', RD_WIDE_CONTINUATION: '00',
    RD_ARST_VALUE: 'xxxxxx010101', RD_SRST_VALUE: '110011101010', RD_INIT_VALUE: 'xxxxxx000111',
    WR_CLK_ENABLE: '1', WR_CLK_POLARITY: '1', WR_PRIORITY_MASK: '0', WR_WIDE_CONTINUATION: '0' };
  const C = { RD_CLK: [clk[0], clk[0]], RD_EN: [en0[0], en1[0]], RD_ARST: [ar0[0], '0'], RD_SRST: [sr0[0], sr1[0]], RD_ADDR: [...ra0, ...ra1], RD_DATA: [...q0, ...q1],
    WR_CLK: clk, WR_EN: we, WR_ADDR: wa, WR_DATA: wd };
  const json = { modules: { t: { ports, cells: { m: { type: '$mem_v2', parameters: P, connections: C } }, netnames: {} } } };
  for (const wide of [false, true]) {
    const sim = new CompiledSim(compileNetlist(json, { top: 't', wide }));
    const mem = Array(8).fill(0b010101n);
    let o0 = 0b000111n, o1 = 0n;
    assert.deepEqual([sim.get('Q0'), sim.get('Q1')], [o0, o1]);
    const r = rng(17);
    for (let k = 0; k < 500; k++) {
      const v = { WA: BigInt(Math.floor(r() * 8)), WD: BigInt(Math.floor(r() * 64)), WE: r() < 0.5 ? BigInt(Math.floor(r() * 64)) : 0n,
        RA0: BigInt(Math.floor(r() * 8)), RA1: BigInt(Math.floor(r() * 8)), EN0: BigInt(r() < 0.7), EN1: BigInt(r() < 0.7),
        SR0: BigInt(r() < 0.15), SR1: BigInt(r() < 0.15), AR0: BigInt(r() < 0.1) };
      for (const [p, x] of Object.entries(v)) sim.set(p, x);
      sim.cycle(0);
      if (v.AR0) o0 = 0b010101n;
      assert.equal(sim.get('Q0'), o0, `cycle ${k}, before the edge${wide ? ' (wide)' : ''}`);
      // the edge: the reads (port 1 seeing this edge's write), then the write
      const merged = (old, a) => (a === v.WA ? (old & ~v.WE & 63n) | (v.WD & v.WE) : old);
      o0 = v.AR0 ? 0b010101n : v.SR0 ? 0b101010n : v.EN0 ? mem[v.RA0] : o0;
      o1 = v.EN1 ? (v.SR1 ? 0b110011n : merged(mem[v.RA1], v.RA1)) : o1;
      mem[v.WA] = merged(mem[v.WA], v.WA);
      sim.cycle(1);
      assert.deepEqual([sim.get('Q0'), sim.get('Q1')], [o0, o1], `cycle ${k}${wide ? ' (wide)' : ''}`);
    }
  }
});

// ------------------------------------------------------------------ what it does not compile
const failure = async (name, text) => {
  try { await compileDesign(designOf(src(name, text), name.replace(/\.\w+$/, '')), { run: yosysNode }); } catch (e) { assert.ok(e instanceof CompileError, e.message); return e.message; }
  return null;
};
test('a combinational loop, an inout port, a tristate buffer, a primitive with no model (PULLUP): not compiled, with the reason', async () => {
  assert.equal(await failure('loop.v', 'module loop(input x, y, output a); wire b; assign a = b ^ x; assign b = a & y; endmodule'), "combinational loop through 'b': not compiled");
  assert.equal(await failure('io.v', "module io(input en, d, inout p, output q); assign p = en ? d : 1'bz; assign q = p; endmodule"), "the inout port 'p' (a tristate) cannot be compiled");
  const tb = oneCell('$tribuf', { WIDTH: 1 }, { A: 1, EN: 1, Y: 1 });
  assert.throws(() => compileNetlist(tb, { top: 't' }), { message: "the tristate buffer 'c' cannot be compiled" });
  assert.equal(await failure('pu.v', 'module pu(input d, output q); wire w; PULLUP p (.O(w)); assign q = d & w; endmodule'), 'the compiled simulator has no model of PULLUP');
  // a latch in a loop with itself never settles: an error when it runs
  const s = await compileDesign(designOf(src('osc.v', 'module osc(input en, output reg q); always @* if (en) q = ~q; endmodule'), 'osc'), { run: yosysNode });
  s.set('en', 1);
  assert.throws(() => s.cycle(0), { name: 'Error', message: 'the design does not settle (a loop through a latch or a clock?)' });
});
test('a DCM: not compiled when its RST is driven and it is cascaded or its CLK90 used, its CLKIN is not an input port or a DCM\'s steady clock, or the main clock is another', async () => {
  const dcm = (ports, conn) => `module d(input clk, ${ports}, output reg [3:0] n = 0); wire c; DCM_SP u (${conn}, .CLKFX(c)); always @(posedge c) n <= n + 1; endmodule`;
  // (RST driven: by a DCM the main clock clocks; a cascaded DCM's, a DCM clocked by a reset one, CLK90 / CLK270 not)
  assert.ok(await compileDesign(designOf(src('d.v', dcm('input r', '.CLKIN(clk), .RST(r)')), 'd'), { run: yosysNode }));
  assert.equal(await failure('d.v', dcm('input r', '.CLKIN(x), .RST(r)').replace('wire c;', "wire c, x; DCM_SP a (.CLKIN(clk), .RST(1'b0), .CLKFX(x));")),
    "the DCM 'u' has its RST driven by the design and is clocked by CLKFX of 'a': not compiled");
  assert.equal(await failure('d.v', dcm('input r', ".CLKIN(x), .RST(1'b0)").replace('wire c;', 'wire c, x; DCM_SP a (.CLKIN(clk), .RST(r), .CLKFX(x));')),
    "the DCM 'u' is clocked by CLKFX of 'a', whose RST is driven by the design: not compiled");
  assert.equal(await failure('d.v', dcm('input r', '.CLKIN(clk), .RST(r), .CLK90(c90)').replace('wire c;', 'wire c, c90;').replace('posedge c)', 'posedge c90)')),
    "the DCM 'u' has its RST driven by the design and its CLK90 used: not compiled");
  assert.equal(await failure('d.v', dcm('input r', ".CLKIN(k[1]), .RST(1'b0)").replace('wire c;', 'wire c; reg [1:0] k = 0; always @(posedge clk) k <= k + 1;')),
    "the DCM 'u' is not clocked by an input port: not compiled");
  // (a cascade from CLK2X180, high from the lock before its first rising edge, is not a steady clock)
  assert.equal(await failure('d.v', dcm('input r', ".CLKIN(x), .RST(1'b0)").replace('wire c;', "wire c, x; DCM_SP a (.CLKIN(clk), .RST(1'b0), .CLK2X180(x));")),
    "the DCM 'u' has a clock input that is not a steady clock: not compiled");
  const json = (await netlistOf(designOf(src('d.v', dcm('input b', ".CLKIN(clk), .RST(1'b0)")), 'd'), { run: yosysNode })).json;
  assert.throws(() => compileNetlist(json, { top: 'd', clock: 'b' }), { message: "the DCM 'u' is clocked by 'clk', not by the main clock 'b': not compiled" });
  assert.throws(() => compileNetlist(json, { top: 'd', clock: false }), { message: "the DCM 'u' is clocked by 'clk', with no main clock: not compiled" });
  // RST tied high: never locked, its clocks low
  const s = await compileDesign(designOf(src('d.v', dcm('input b', ".CLKIN(clk), .RST(1'b1)")), 'd'), { run: yosysNode });
  s.cycle(100);
  assert.equal(s.get('n'), 0n);
});

test('an output at high impedance (Z) is 0, with a warning', async () => {
  const s = await compileDesign(designOf(src('tbuf.v', "module tbuf(input en, d, output p); assign p = en ? d : 1'bz; endmodule"), 'tbuf'), { run: yosysNode });
  assert.deepEqual(s.warnings, ["a high-impedance value ('Z') is 0 in the compiled simulator"]);
  s.set('d', 1);
  s.set('en', 1);
  s.cycle(0);
  assert.equal(s.get('p'), 1n);
  s.set('en', 0);
  s.cycle(0);
  assert.equal(s.get('p'), 0n);
});
test('the buffers (BUFG, IBUFG…) are wires; the clock through a BUFG is the main clock', async () => {
  const s = await compileDesign(designOf(src('withbuf.v', 'module withbuf(input clk, input [3:0] d, output reg [3:0] q); wire c; BUFG b (.I(clk), .O(c)); always @(posedge c) q <= q + d; endmodule'), 'withbuf'), { run: yosysNode });
  assert.deepEqual(s.warnings, []);
  assert.equal(s.model.clock.port, 'clk');
  s.set('d', 3);
  s.cycle(5);
  assert.equal(s.get('q'), 15n);
});

// ------------------------------------------------------------------ the API
test('set, cycle, get, reset; a 64-bit counter against its arithmetic', async () => {
  const s = await compileDesign(designOf(src('cnt.v', `module cnt(input clk, input [63:0] step, input hold, output reg [63:0] n);
    initial n = 64'hFFFF_FFFF_FFFF_FF00;
    always @(posedge clk) if (!hold) n <= n + step; endmodule`), 'cnt'), { run: yosysNode });
  const step = 0x1_0000_0001n;
  s.set('step', step);
  s.cycle(1000);
  assert.equal(s.cycles, 1000);
  assert.equal(s.get('n'), BigInt.asUintN(64, 0xFFFF_FFFF_FFFF_FF00n + 1000n * step));
  s.set('hold', 1);
  s.cycle(10);
  assert.equal(s.get('n'), BigInt.asUintN(64, 0xFFFF_FFFF_FFFF_FF00n + 1000n * step));
  s.set('step', -1n);   // (taken modulo 2^64)
  assert.equal(s.get('step'), 0xFFFF_FFFF_FFFF_FFFFn);
  s.reset();            // the registers at their initial values, the inputs kept
  assert.equal(s.cycles, 0);
  assert.equal(s.get('n'), 0xFFFF_FFFF_FFFF_FF00n);
  assert.equal(s.get('hold'), 1n);
  assert.throws(() => s.set('n', 1), { message: "'n' is not an input port" });
  assert.throws(() => s.get('nope'), { message: "no port or net 'nope'" });
});
test('the main clock: the input clocking the most register bits, of two the one named clk…; or the one given', async () => {
  const text = `module two(input clk, input b, output reg [3:0] p, q);
    always @(posedge clk) p <= p + 1; always @(posedge b) q <= q + 1; endmodule`;
  const json = (await netlistOf(designOf(src('two.v', text), 'two'), { run: yosysNode })).json;
  assert.equal(compileNetlist(json, { top: 'two' }).clock.port, 'clk');
  const s = new CompiledSim(compileNetlist(json, { top: 'two', clock: 'b' }));
  s.cycle(3);
  assert.deepEqual([s.get('p'), s.get('q')], [0n, 3n]);
  assert.throws(() => compileNetlist(json, { top: 'two', clock: 'p' }), { message: "the clock 'p' is not an input port" });
});

// ------------------------------------------------------------------ the open-flow board tests with Xilinx primitives
const OPEN = path.join(ROOT, 'test/fixtures/open-flow');
for (const name of ['feat_bram', 'feat_const_bram', 'feat_const_dcm', 'feat_const_mult', 'feat_constmult', 'feat_dcm', 'feat_dcm2', 'feat_dcm_div2', 'feat_dcm_fx', 'feat_dcm_wait', 'feat_mult', 'feat_srl', 'feat_srl_var', 'hard_prim']) {
  test(`open-flow design ${name}: the compiled simulator computes what the event-driven one does`, async () => {
    const pj = JSON.parse(fs.readFileSync(path.join(OPEN, name, 'silinx.json'), 'utf8'));
    const sources = pj.files.filter(f => f.role !== 'testbench').map(f => ({ ...f, text: fs.readFileSync(path.join(OPEN, name, f.path), 'utf8') }));
    const sim = await compileDesign(designOf(sources, pj.top), { run: yosysNode });
    assert.deepEqual(sim.warnings, []);
    assert.equal(sim.model.clock?.port, 'clk');
    const r = await diffCycles(sources, pj.top, { cycles: 600, nets: true, inputs: randomInputs(sources, pj.top, { p: 0.05, seed: 3 }) });
    assert.deepEqual(r.mismatches, []);
    assert.ok(r.bits > 10000, `${r.bits} bits compared`);
  });
}

// ------------------------------------------------------------------ speed
// ------------------------------------------------------------------ activity (#464)
// The cells evaluated only when what they read changed: against the code without it (activity: false, checked
// against the event-driven simulator above), in runs of many cycles (a run evaluates everything at its start),
// the inputs changed between them: every value, the memories, the counts and edges of a watch on the outputs
// (their bits' levels, pairs of them, the falling edges of the first one), equal after each run; with the
// guards the profile chooses, with every block guarded ('fine') and with the fewest guards ('max').
async function netlistJson(sources, top, { generics, direct = false, extra = '' } = {}) {
  if (!direct) return netlistOf(designOf(sources, top, { generics }), { run: yosysNode });
  const files = Object.fromEntries(sources.map(x => [x.path, x.text]));
  const out = await yosysNode(['-q', '-p', `read_verilog -sv ${sources.map(x => x.path).join(' ')}; prep -flatten -top ${top}; ${extra ? `${extra}; ` : ''}memory -nomap; opt_clean -purge; write_json ${top}_a.json`], files);
  return { json: JSON.parse(out[`${top}_a.json`]), top };
}
async function sameActivity(sources, top, { generics, clock = null, seed = 3, runs = 40, longest = 4000, p = 0.3, direct = false, extra = '' } = {}) {
  const { json, top: t } = await netlistJson(sources, top, { generics, direct, extra });
  const outs = Object.entries(json.modules[t].ports).filter(([, x]) => x.direction === 'output')
    .flatMap(([name, x]) => x.bits.map((_, i) => portBit(json, t, name, i)));
  const watch = {
    levels: outs.map((bit, i) => ({ bit, on: i & 1 })),
    pairs: outs.slice(1).map((bit, i) => [{ bit: outs[i], on: 1 }, { bit, on: 0 }]),
    edges: outs.length ? [{ bit: outs[0], capture: outs.slice(0, 8) }] : [],
  };
  const sims = [false, true, 'fine', 'max'].map(activity => new CompiledSim(compileNetlist(json, { top: t, clock, watch, activity })));
  const [ref, ...others] = sims;
  const ins = ref.model.inputs.filter(x => x.name !== ref.model.clock?.port);
  const r = rng(seed);
  const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
  const state = s => ({ vals: s.inst.vals().map(String), mems: s.inst.mems.map(m => Array.from(m, String)), taken: s.take() });
  let guarded = 0;
  for (const s of others) guarded += (s.model.code.match(/^if \(\(D0 & /gm) || []).length;
  for (let k = 0; k < runs; k++) {
    for (const x of ins) if (k === 0 || r() < p) { const v = word(x.w); for (const s of sims) s.set(x.name, v); }
    const n = 1 + Math.floor(r() ** 2 * longest);
    for (const s of sims) s.cycle(n);
    const want = state(ref);
    others.forEach((s, i) => assert.deepEqual(state(s), want, `${top}: run ${k} (${n} cycles), activity ${['on', "'fine'", "'max'"][i]}`));
  }
  return { guarded };
}
for (const name of EXAMPLES) {
  test(`activity: example ${name}, the same values, memories, counts and edges as without it`, async () => {
    const ex = example(name);
    const gens = timingGenerics(designOf(ex.design, ex.project.top).top.params);
    const generics = gens.length ? scaledGenerics(gens, autoTimeScale(gens) * 100) : undefined;
    const { guarded } = await sameActivity(ex.design, ex.project.top, { generics });
    // (gates: no flip-flop, its cells guarded by the inputs only, with 'fine' and 'max')
    if (name !== 'gates') assert.ok(guarded > 2, `${guarded} guarded segments`);
  });
}
for (const [file, top, o] of [['ops.v', 'ops', { longest: 200 }], ['regs.v', 'regs'], ['clocks.v', 'clocks', { clock: 'clk' }], ['mems.v', 'mems'], ['ops.vhd', 'ops_vhd'],
  ['cells.v', 'cells', { direct: true, extra: 'opt_dff' }], ['prims.vhd', 'prims_vhd'], ['prims.v', 'prims_v'], ['dcm.vhd', 'dcm_vhd'], ['dcm.v', 'dcm_v'], ['dcm_rst.vhd', 'dcm_rst_vhd'], ['dcm_rst.v', 'dcm_rst_v'], ['vga_bars.vhd', 'vga_bars']]) {
  test(`activity: ${file}, the same values, memories, counts and edges as without it`, async () => {
    await sameActivity(fixture(file), top, { longest: 1500, ...o });
  });
}
test('activity: the segments, from the rates of the values their blocks read', () => {
  const blk = (cells, keys, always = false) => ({ cells: Array(cells).fill(0), keys, always });
  const shape = segs => segs.map(sg => [sg.blocks.reduce((a, b) => a + b.cells.length, 0), sg.keys ? [...sg.keys].sort().join() : null]);
  // a counter's cells (its value changes at every step), the cells of the slow values behind it: one guard
  const blocks = [blk(3, ['c']), blk(10, ['s1']), blk(20, ['s1', 's2']), blk(2, ['c', 's1'])];
  const rate = new Map([['c', 1], ['s1', 0.001], ['s2', 0.0001]]);
  const segs = segmentsOf(blocks, rate);
  assert.deepEqual(shape(segs), [[3, null], [30, 's1,s2'], [2, null]]);
  assert.ok(Math.abs(segs.cost - (3 + 2 + 0.0011 * 30 + 2)) < 1e-9, `${segs.cost} cells a step`);
  // no rates (all 0): the fewest guards; a block always evaluated (a DCM's output) is never guarded
  assert.deepEqual(shape(segmentsOf([...blocks, blk(4, [], true), blk(5, ['s2'])], new Map())), [[35, 'c,s1,s2'], [4, null], [5, 's2']]);
  // a value changing every other step (above PMAX): unguarded; a lone small block: not worth its guard
  assert.deepEqual(shape(segmentsOf([blk(8, ['x'])], new Map([['x', 0.5]]))), [[8, null]]);
  assert.deepEqual(shape(segmentsOf([blk(1, ['x']), blk(3, ['c'])], new Map([['x', 0.1], ['c', 1]]))), [[4, null]]);
  const none = segmentsOf([], new Map());
  assert.deepEqual([[...none], none.cost], [[], 0]);
});
test('speed: the compiled simulator runs millions of cycles per second (pong at its real generics)', async () => {
  const ex = example('pong');
  const s = await compileDesign(designOf(ex.design, ex.project.top), { run: yosysNode });
  s.cycle(100000);   // (compiled by the JIT)
  const t0 = performance.now();
  s.cycle(2_000_000);
  const rate = 2_000_000 / ((performance.now() - t0) / 1000);
  // (about 45 million per second on a laptop; the floor is for slow CI machines)
  assert.ok(rate > 2e6, `${Math.round(rate).toLocaleString()} cycles per second`);
});
test('speed: a design on a DCM\'s 25 MHz clock (CLKFX = CLKIN / 2) runs millions of the board clock\'s cycles per second', async () => {
  const text = `module v(input clk, input [2:0] sw, output reg hs = 1, vs = 1, output reg [2:0] rgb = 0);
    wire fx, c25; reg [9:0] x = 0, y = 0;
    DCM_SP #(.CLKFX_MULTIPLY(2), .CLKFX_DIVIDE(4)) u (.CLKIN(clk), .RST(1'b0), .CLKFX(fx));
    BUFG b (.I(fx), .O(c25));
    always @(posedge c25) begin
      if (x == 799) begin x <= 0; y <= y == 524 ? 0 : y + 1; end else x <= x + 1;
      hs <= ~(x >= 656 && x < 752); vs <= ~(y >= 490 && y < 492);
      rgb <= x < 640 && y < 480 ? x[5:3] ^ y[5:3] ^ sw : 3'd0;
    end
  endmodule`;
  const s = await compileDesign(designOf(src('v.v', text), 'v'), { run: yosysNode });
  s.cycle(100000);
  const t0 = performance.now();
  s.cycle(2_000_000);
  const rate = 2_000_000 / ((performance.now() - t0) / 1000);
  // (about 26 million per second on a laptop)
  assert.ok(rate > 2e6, `${Math.round(rate).toLocaleString()} cycles per second`);
  // (a line of 800 pixels: 1600 cycles of the 50 MHz clock)
  assert.equal(s.get('hs'), 1n);
});
