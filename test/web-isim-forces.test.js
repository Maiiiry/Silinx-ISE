// ISim's path resolution and forces (web/js/isim-forces.js, #405: out of mountISim), on the simulator itself: the
// values a design computes from a forced input are the reference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import * as V from '../core/values.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';

const { mountForces } = await import('../web/js/isim-forces.js');

const SRC = `module top(input [3:0] a, output [3:0] y);
  sub u(.a(a), .y(y));
endmodule
module sub(input [3:0] a, output [3:0] y);
  assign y = ~a;
endmodule
`;
function windowOf() {
  const design = elaborate(compile([{ path: 'top.v', lang: 'verilog', text: SRC }]), 'top');
  const sim = new Simulator(design);
  const st = { curInst: design.top, forces: [], forceSeq: 1 };
  const said = [], seen = { invalidate: 0, objects: 0 };
  const f = mountForces({ st, sim, design, invalidate: () => seen.invalidate++, logLine: (t, k) => said.push([t, k]), objectsChanged: () => seen.objects++ });
  return { design, sim, st, said, seen, ...f };
}
const val = (s) => V.toNum(s.val);

test('#405 ISim paths: absolute, relative to the selected instance, with / or ., any case; a port as its signal', () => {
  const w = windowOf();
  const a = w.design.signals.find((s) => s.path === 'top.a');
  assert.equal(w.findSignal('/top/a'), a);
  assert.equal(w.findSignal('top.a'), a);
  assert.equal(w.findSignal('A'), a);
  assert.equal(w.findSignal(' /TOP/A '), a);
  // u's port a is top's signal a
  assert.equal(w.findSignal('/top/u/a'), a);
  assert.equal(w.findSignal('u/a'), a);
  assert.equal(w.findInst('/top/u').name, 'u');
  assert.equal(w.findInst('u').name, 'u');
  assert.equal(w.findInst('top'), w.design.top);
  assert.equal(w.findSignal('nope'), null);
  assert.equal(w.findInst('/top/v'), null);
});

test('#405 ISim forces: a repeating pattern drives the design, a later force cuts it, Remove releases it', () => {
  const w = windowOf();
  const a = w.findSignal('a'), y = w.findSignal('y');
  w.sim.start(); w.sim.run(0);
  // 3 at once, 5 from 10 ns, again every 20 ns
  w.addForce(a, { pattern: [{ off: 0, val: V.fromInt(3, 4, false) }, { off: 10000, val: V.fromInt(5, 4, false) }], repeat: 20000, desc: 'f1' });
  assert.equal(val(y), 12, 'applied at once, without running');
  assert.equal(w.isForced(a), true);
  assert.equal(w.isForced(y), false);
  const at = (t) => { w.sim.run(t); return val(y); };
  assert.deepEqual([at(5000), at(15000), at(25000), at(35000)], [12, 10, 12, 10]);
  // a new force on the same signal from 40 ns replaces the old one there
  w.addForce(a, { pattern: [{ off: 0, val: V.fromInt(0, 4, false) }], start: 40000, desc: 'f2' });
  assert.deepEqual([at(39000), at(45000), at(65000)], [10, 15, 15]);
  assert.equal(w.st.forces.length, 2);
  assert.ok(w.seen.objects >= 2 && w.seen.invalidate >= 2);
  w.removeForces(a);
  assert.equal(w.isForced(a), false);
  assert.equal(at(70000), 15, 'released: the input, driven by nothing else, keeps its last value');
  assert.deepEqual(w.said, [['Force removed from /top/a', 'info']]);
  w.removeForces(y);   // none: nothing said
  assert.equal(w.said.length, 1);
});

test('#405 ISim forces: added once the simulation has finished, it waits for Restart and says so', () => {
  const w = windowOf();
  w.sim.finished = 'finish';
  const a = w.findSignal('a');
  const f = w.addForce(a, { pattern: [{ off: 0, val: V.fromInt(1, 4, false) }], desc: 'late' });
  assert.equal(f.rt, undefined, 'not injected');
  assert.deepEqual(w.said, [['WARNING: simulation has finished; the force takes effect after restart', 'warning']]);
  assert.equal(w.st.forces.length, 1);
});
