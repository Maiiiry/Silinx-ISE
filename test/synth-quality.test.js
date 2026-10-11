// Quality of the open synthesis (Silinx's front end + Yosys, core/synth-open.js) and of the packer
// (core/fpga/pack.js): size budgets of the designs in the repository, so that a change that makes
// the netlists larger fails here (the measurements: research/synth-quality/README.md). Their
// equivalence with the RTL is checked by test/synth-diff-fixtures.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { expectWarnings } from './diff-synth.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const langOf = f => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');

function fixture(name) {
  const dir = path.join(ROOT, 'test/fixtures/designs', name);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'));
  return { key: `designs/${name}`, top: spec.top, sources: spec.files.map(f => ({ path: f, lang: langOf(f), text: fs.readFileSync(path.join(dir, f), 'utf8') })) };
}
function example(name) {
  const dir = path.join(ROOT, 'examples', name);
  const proj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const files = proj.files.filter(f => (f.role || 'design') === 'design' && (f.lang === 'vhdl' || f.lang === 'verilog'));
  return { key: `examples/${name}`, top: proj.top, sources: files.map(f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.join(dir, f.path), 'utf8') })) };
}
// (the warnings, front end and synthesis, as test/diff-synth.js gathers them, checked against
// test/fixtures/synth-warnings.json; the packer's must be none)
async function synth({ key, top, sources }) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  const design = elaborate(lib, top);
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  const fe = [...lib.errors, ...design.diags].filter(d => d.severity === 'warning').map(d => `${d.file}:${d.line} ${d.message}`);
  expectWarnings(key, [...fe, ...r.warnings]);
  const nl = readYosysJson(r.files[`${r.top}.json`]);
  const packed = pack(nl, { carryOut: 'xor' });
  assert.deepEqual(packed.warnings, [], `${key}: the packer's warnings`);
  return { ...r, nl, packed };
}
// the longest carry chain of a netlist (MUXCY stages)
function longestChain(nl) {
  const mux = nl.cells.filter(c => c.type === 'MUXCY');
  const next = new Map();
  for (const m of mux) { const d = nl.nets[m.pins.CI].driver; if (d && nl.cells[d.cell].type === 'MUXCY') next.set(nl.cells[d.cell], m); }
  let best = 0;
  for (const m of mux) { let k = 0; for (let c = m; c; c = next.get(c)) k++; best = Math.max(best, k); }
  return best;
}

// budgets: about 10 % above what this version makes (in brackets: Yosys's own synth_xilinx LUT
// mapping before 15.10.2, and XST where known)
const BUDGETS = {
  // 42-state control unit + 8-bit data path (stock mapping: 389 LUTs, 369 MUXF, 281 slices)
  cpu8: { design: () => fixture('cpu8'), luts: 275, muxes: 70, slices: 165 },
  // blinky (stock: 376 cells, 89 slices; XST: 145 LUTs)
  blinky: { design: () => fixture('blinky'), luts: 70, muxes: 16, slices: 78 },
  // the example project (stock: 104 slices; XST: 104 LUTs, 99 slices)
  'examples/blinky': { design: () => example('blinky'), luts: 78, muxes: 19, slices: 95 },
  fsm: { design: () => fixture('fsm'), luts: 14, muxes: 4, slices: 10 },
  adder: { design: () => fixture('adder'), luts: 72, muxes: 2, slices: 63 },
};

for (const [name, b] of Object.entries(BUDGETS)) {
  test(`size budget: ${name} (at most ${b.luts} LUTs, ${b.muxes} MUXF, ${b.slices} slices)`, { timeout: 120000 }, async () => {
    const r = await synth(b.design());
    const s = `${r.util.luts} LUTs, ${r.util.muxes} MUXF, ${r.util.carry} carry, ${r.util.flipFlops} FFs, ${r.packed.stats.slices} slices`;
    assert.ok(r.util.luts <= b.luts, s);
    assert.ok(r.util.muxes <= b.muxes, s);
    assert.ok(r.packed.stats.slices <= b.slices, s);
  });
}

test('blinky: (1 << level) - 1 of a 3-bit level is a table, not a 32-bit subtracter (the longest carry chain is a 20-bit counter)', { timeout: 120000 }, async () => {
  const r = await synth(example('blinky'));
  assert.match(r.files['top_syn.v'], /function automatic \[31:0\] tab\d+\(input \[2:0\] i\)/);
  assert.equal(longestChain(r.nl), 19);   // 20-bit counters: 19 MUXCY and their carry in
});
