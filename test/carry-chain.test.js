// Carry chains of logic written as gates (core/carry-chain.js, #77): found in the coarse netlist and made
// $alu cells, which synth_xilinx maps onto the carry chain (MUXCY / XORCY). Ripple adders written as
// gates (Verilog, an AND-inverter graph as the EPFL benchmarks, a VHDL schematic of full adders), a
// comparator; each synthesized and its netlist simulated against the design (test/diff-synth.js); a chain
// too short, and a design with few gates (synthesized as before, in one run of Yosys).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen, criticalDelay } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { gateAssignments, rewriteCarryChains, GATE_MIN, MIN_CHAIN } from '../core/carry-chain.js';
import { compareNetlist } from './diff-synth.js';

const syn = async (text, top, lang = 'verilog') => {
  const design = elaborate(compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', lang, text }]), top);
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  const d = compareNetlist(design, r, { name: top, sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || d.reason);
  return { r, design };
};

// a ripple-carry adder of full adders written as gates, n bits
const rippleV = n => `module add(input [${n - 1}:0] a, b, input ci, output [${n - 1}:0] s, output co);
  wire [${n}:0] c;
  assign c[0] = ci;
  genvar i;
  generate for (i = 0; i < ${n}; i = i + 1) begin : fa
    assign s[i] = a[i] ^ b[i] ^ c[i];
    assign c[i + 1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]));
  end endgenerate
  assign co = c[${n}];
endmodule`;

// the same as an AND-inverter graph (as the EPFL benchmarks are written: only & and ~, carries inverted)
function aigAdder(n) {
  const L = [`module aig(${[...Array(n).keys()].map(i => `a${i}, b${i}`).join(', ')}, ${[...Array(n).keys()].map(i => `s${i}`).join(', ')}, co);`,
    `  input ${[...Array(n).keys()].map(i => `a${i}, b${i}`).join(', ')};`, `  output ${[...Array(n).keys()].map(i => `s${i}`).join(', ')}, co;`];
  let k = 0;
  const w = () => `n${k++}`;
  const decl = [];
  const and = (x, y) => { const r = w(); decl.push(r); L.push(`  assign ${r} = ${x} & ${y};`); return r; };
  const xor = (x, y) => { const p = and(x, `~${y}`), q = and(`~${x}`, y), r = and(`~${p}`, `~${q}`); return `~${r}`; };
  let nc = null;   // the inverted carry in (none at bit 0)
  for (let i = 0; i < n; i++) {
    const a = `a${i}`, b = `b${i}`;
    if (nc === null) { L.push(`  assign s${i} = ${xor(a, b)};`); nc = `~${and(a, b)}`; continue; }
    const c = `~${nc.replace(/^~/, '')}`.replace(/^~~/, '');
    const t = xor(a, b);
    L.push(`  assign s${i} = ${xor(t, nc.startsWith('~') ? nc.slice(1) : `~${nc}`)};`);
    // ~carry out = ~(a & b) & ~(c & (a ^ b))
    nc = and(`~${and(a, b)}`, `~${and(nc.startsWith('~') ? nc.slice(1) : `~${nc}`, t)}`);
    void c;
  }
  L.push(`  assign co = ~${nc.replace(/^~/, '')};`.replace('~~', ''));
  L.splice(3, 0, `  wire ${decl.join(', ')};`);
  L.push('endmodule');
  return L.join('\n');
}

test('a ripple adder written as gates, 16 bits: one chain of 16, made the carry chain (MUXCY / XORCY); the netlist simulates like it, no warning', { timeout: 300000 }, async () => {
  const { r, design } = await syn(rippleV(16), 'add');
  assert.ok(gateAssignments(design) >= GATE_MIN);
  assert.deepEqual(r.chains, [16]);
  assert.equal(r.cells.MUXCY, 16);
  assert.ok(r.cells.XORCY >= 15, JSON.stringify(r.cells));
  assert.deepEqual(r.warnings, []);
});

test('an adder as an AND-inverter graph (the EPFL adder\'s style: inverted carries), 32 bits: a chain, the carry chain', { timeout: 300000 }, async () => {
  const { r } = await syn(aigAdder(32), 'aig');
  assert.equal(r.chains.length, 1);
  assert.ok(r.chains[0] >= 30, JSON.stringify(r.chains));
  assert.ok(r.cells.MUXCY >= 30, JSON.stringify(r.cells));
  assert.deepEqual(r.warnings, []);
  // faster than the same adder mapped onto LUTs only (the carry chain: a few ns for 32 bits)
  assert.ok(criticalDelay(r.files[`${r.top}.json`], r.top) < 12, String(criticalDelay(r.files[`${r.top}.json`], r.top)));
});

test('a VHDL schematic of full adders (an entity instantiated per bit, as Silinx writes a schematic): the chain across the instances', { timeout: 300000 }, async () => {
  const text = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity fa is port (a, b, ci : in std_logic; s, co : out std_logic); end fa;
architecture g of fa is signal x : std_logic; begin x <= a xor b; s <= x xor ci; co <= (a and b) or (x and ci); end g;
entity add8 is port (a, b : in std_logic_vector(7 downto 0); s : out std_logic_vector(7 downto 0); co : out std_logic); end add8;
architecture s of add8 is signal c : std_logic_vector(8 downto 0); begin
  c(0) <= '0';
  g: for i in 0 to 7 generate u: entity work.fa port map (a => a(i), b => b(i), ci => c(i), s => s(i), co => c(i + 1)); end generate;
  co <= c(8);
end s;`;
  const { r } = await syn(text.replace('entity add8', 'library IEEE; use IEEE.STD_LOGIC_1164.ALL;\nentity add8'), 'add8', 'vhdl');
  assert.equal(r.chains.length, 1);
  assert.ok(r.chains[0] >= 7, JSON.stringify(r.chains));
  assert.ok(r.cells.MUXCY >= 7, JSON.stringify(r.cells));
});

test('a comparator a < b written as gates (a borrow chain: MAJ(~a, b, c)): a chain', { timeout: 300000 }, async () => {
  const n = 16;
  const text = `module lt(input [${n - 1}:0] a, b, output y);
  wire [${n}:0] c;
  assign c[0] = 1'b0;
  genvar i;
  generate for (i = 0; i < ${n}; i = i + 1) begin : g
    assign c[i + 1] = (~a[i] & b[i]) | (~(a[i] ^ b[i]) & c[i]);
  end endgenerate
  assign y = c[${n}];
endmodule`;
  const { r } = await syn(text, 'lt');
  assert.equal(r.chains.length, 1);
  assert.ok(r.chains[0] >= n - 1, JSON.stringify(r.chains));
  assert.ok(r.cells.MUXCY >= n - 1, JSON.stringify(r.cells));
});

test('a chain shorter than MIN_CHAIN is left to the LUTs; a design with few gates is synthesized as before (one run, no chain)', { timeout: 300000 }, async () => {
  // 3 bits of carry, but more than GATE_MIN gates: looked at, nothing rewritten
  const pad = [...Array(GATE_MIN)].map((_, i) => `  assign p[${i}] = a[0] ^ b[${i % 2}];`).join('\n');
  const short = rippleV(MIN_CHAIN - 1).replace('output co);', `output co, output [${GATE_MIN - 1}:0] p);\n${pad}`);
  const { r } = await syn(short, 'add');
  assert.deepEqual(r.chains, []);
  assert.equal(r.cells.MUXCY, undefined);
  // a counter (one gate): not looked at
  const { r: r2, design } = await syn('module cnt(input clk, output reg [7:0] q = 0); always @(posedge clk) q <= q + 1; endmodule', 'cnt');
  assert.ok(gateAssignments(design) < GATE_MIN);
  assert.deepEqual(r2.chains, []);
});

test('rewriteCarryChains on a netlist with no logic: nothing found, the netlist unchanged', () => {
  const json = { modules: { top: { attributes: { top: 1 }, ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3] } }, cells: { n: { type: '$not', parameters: {}, port_directions: { A: 'input', Y: 'output' }, connections: { A: [2], Y: [3] } } }, netnames: {} } } };
  const before = JSON.stringify(json);
  const r = rewriteCarryChains(json, { top: 'top' });
  assert.deepEqual(r.chains, []);
  assert.equal(JSON.stringify(r.json), before);
});
