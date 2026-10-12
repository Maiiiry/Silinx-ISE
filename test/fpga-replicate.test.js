// core/fpga/replicate.js: register replication (#4). The plan (which flip-flops, which loads each
// copy takes) from a placement and its timing; the replicated netlist computes exactly what the
// netlist did (simulated, packed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { replicationPlan, replicateFlipFlops, REPLICATION, REPLICATE_MAX_SLICES } from '../core/fpga/replicate.js';
import { compareSims } from './fpga-sim.js';

// a flip-flop (s[0]) that selects 16 outputs: 16 loads
const FAN = `module fan(input clk, input [1:0] sel, input [15:0] a, output reg [15:0] q);
  reg [1:0] s;
  integer i;
  always @(posedge clk) begin
    s <= sel;
    for (i = 0; i < 16; i = i + 1) q[i] <= s[0] ? a[i] ^ s[1] : a[15 - i];
  end
endmodule
`;
const fanNetlist = async () => {
  const r = await synthesizeOpen(elaborate(compile([{ path: 'fan.v', lang: 'verilog', text: FAN }]), 'fan'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  return readYosysJson(r.files['fan.json']);
};

test('replicateFlipFlops: each group of loads gets a copy of the flip-flop (same type, parameters and inputs); the circuit is unchanged', { timeout: 120000 }, async () => {
  const nl = await fanNetlist();
  const before = JSON.stringify(nl);
  const ff = nl.cells.findIndex(c => /^FD/.test(c.type) && nl.nets[c.pins.Q].loads.length >= 16);
  assert.ok(ff >= 0, 'the select flip-flop drives 16 loads');
  const q = nl.cells[ff].pins.Q;
  const loads = nl.nets[q].loads;
  const groups = [loads.slice(0, 6), loads.slice(6, 11), loads.slice(11)];
  const nl2 = replicateFlipFlops(nl, [{ cell: ff, groups }]);
  assert.equal(JSON.stringify(nl), before, 'the netlist given is not changed');
  assert.equal(nl2.cells.length, nl.cells.length + 2);
  assert.equal(nl2.nets.length, nl.nets.length + 2);
  const copies = nl2.cells.slice(nl.cells.length);
  assert.deepEqual(copies.map(c => c.name), [`${nl.cells[ff].name}_rep1`, `${nl.cells[ff].name}_rep2`]);
  for (const [k, c] of copies.entries()) {
    assert.equal(c.type, nl.cells[ff].type);
    assert.deepEqual(c.params, nl.cells[ff].params);
    const { Q, ...ins } = c.pins;
    const { Q: q0, ...ins0 } = nl.cells[ff].pins;
    assert.deepEqual(ins, ins0, 'the same D, clock, enable and reset');
    assert.equal(nl2.nets[Q].name, `${nl.nets[q0].name}_rep${k + 1}`);
    assert.deepEqual(nl2.nets[Q].driver, { cell: nl.cells.length + k, pin: 'Q' });
    assert.deepEqual(nl2.nets[Q].loads, groups[k + 1]);
    for (const l of groups[k + 1]) assert.equal(nl2.cells[l.cell].pins[l.pin], Q);
    for (const [p, n] of Object.entries(ins)) assert.ok(nl2.nets[n].loads.some(l => l.cell === nl.cells.length + k && l.pin === p), `${p} read by the copy`);
  }
  assert.deepEqual(nl2.nets[q].loads, groups[0]);
  // the replicated netlist, packed, behaves as the netlist
  const packed = pack(nl2, { carryOut: 'xor' });
  assert.deepEqual(packed.warnings, []);
  assert.equal(packed.stats.ffs, pack(nl, { carryOut: 'xor' }).stats.ffs + 2);
  const d = compareSims(nl, packed, { cycles: 300, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
});

test('replicationPlan: the flip-flops of many loads on the critical path with a slow connection; their loads grouped by place', () => {
  // a flip-flop (cell 0) and 20 LUTs reading it: 10 near it (X1-5), 10 far (X40-44)
  const N = 20;
  const nl = { cells: [{ name: 'ff', type: 'FDRE', pins: { Q: 2, D: 3, C: 4 } }], nets: [{ loads: [] }, { loads: [] }, { name: 'q', loads: [] }, { loads: [] }, { loads: [] }] };
  for (let i = 0; i < N; i++) { nl.cells.push({ name: `l${i}`, type: 'LUT1', pins: { I0: 2 } }); nl.nets[2].loads.push({ cell: i + 1, pin: 'I0' }); }
  const packed = { insts: nl.cells.map((c, i) => ({ name: `s${i}`, kind: 'slice' })), cellSites: nl.cells.map((c, i) => ({ inst: i, bel: i ? 'F' : 'FFX' })) };
  const placement = { sites: nl.cells.map((c, i) => ({ tile: i === 0 ? 'CLB_X1Y1' : i <= 10 ? `CLB_X${1 + (i % 5)}Y2` : `CLB_X${40 + (i % 5)}Y30` })) };
  const sta = (crit, delay) => ({ conns: [{ from: 's0.XQ', to: 's15.F1', crit, delay }, { from: 's0.XQ', to: 's2.F1', crit: 0.5, delay: 0.4 }] });
  const plan = replicationPlan(nl, packed, placement, sta(1, 1.6));
  assert.equal(plan.length, 1);
  assert.equal(plan[0].cell, 0);
  // 20 loads, 16 per copy: two groups, the near one first (it stays on the flip-flop)
  assert.deepEqual(plan[0].groups.map(g => g.map(l => l.cell).sort((a, b) => a - b)), [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]);
  // not critical enough, its critical connection fast, too few loads: nothing
  assert.deepEqual(replicationPlan(nl, packed, placement, sta(0.9, 1.6)), []);
  assert.deepEqual(replicationPlan(nl, packed, placement, sta(1, 0.6)), []);
  assert.deepEqual(replicationPlan(nl, packed, placement, sta(1, 1.6), { minFanout: 21 }), []);
  // more copies for more loads (perCopy), at most maxCopies
  assert.equal(replicationPlan(nl, packed, placement, sta(1, 1.6), { perCopy: 5 })[0].groups.length, 4);
  assert.ok(replicationPlan(nl, packed, placement, sta(1, 1.6), { perCopy: 1, maxCopies: 2 })[0].groups.length <= 3);
  assert.deepEqual([REPLICATION.minFanout, REPLICATION.minCrit, REPLICATION.minDelay, REPLICATION.perCopy], [8, 0.98, 1.0, 16]);
  assert.equal(REPLICATE_MAX_SLICES, 3000);
});
