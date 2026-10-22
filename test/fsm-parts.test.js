// The parts of the FSM diagrams (#405: out of core/fsm.js): the HDL (fsm-hdl.js) and the ASM chart conversions
// (fsm-asm.js); fsm.js still exports them. A diagram's VHDL and Verilog, in every encoding and style, compile and
// elaborate with no error or warning, and simulated give the diagram's outputs at every cycle; the diagram as an ASM
// chart and back keeps its states and outputs, and a second round trip gives the same diagram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fsm from '../core/fsm.js';
import { generateFsm } from '../core/fsm-hdl.js';
import { fsmToAsm, asmToFsm } from '../core/fsm-asm.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';

const diagram = () => fsm.normalizeFsm(fsm.newFsm('ctl', 'vhdl'));

test('#405 FSM parts: fsm.js exports the modules\' functions', () => {
  assert.equal(fsm.generateFsm, generateFsm);
  assert.equal(fsm.fsmToAsm, fsmToAsm);
  assert.equal(fsm.asmToFsm, asmToFsm);
});

test('#405 FSM parts: the HDL of a diagram, every encoding and style, both languages: compiled, elaborated, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const encoding of fsm.FSM_ENCODINGS) {
      for (const style of fsm.FSM_STYLES) {
        const what = `${lang} ${encoding} ${style}`;
        const g = generateFsm(fsm.normalizeFsm({ ...diagram(), lang, encoding, style }), lang);
        assert.deepEqual([g.lang, g.filename], [lang, `ctl.${lang === 'vhdl' ? 'vhd' : 'v'}`], what);
        const lib = compile([{ path: g.filename, lang, text: g.code }]);
        assert.deepEqual(lib.errors.map(e => `${e.severity}: ${e.message}`), [], what);
        const design = elaborate(lib, 'ctl');
        assert.deepEqual(design.diags.map(e => `${e.severity}: ${e.message}`), [], what);
        assert.equal(design.top.name, 'ctl', what);
      }
    }
  }
});

test('#405 FSM parts: the generated HDL gives the diagram\'s outputs at every cycle (simulated, both languages)', () => {
  const d = diagram();
  const xs = [1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1];
  // the reference: the diagram's own steps (simulateFsm), its output z in each cycle
  const want = fsm.simulateFsm(d, xs.map(x => ({ x }))).map(r => String(r.outputs.z)).join('');
  assert.equal(want, '00110010001110');
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateFsm(fsm.normalizeFsm({ ...d, lang }), lang);
    const design = elaborate(compile([{ path: g.filename, lang, text: g.code }]), 'ctl');
    const port = n => design.top.ports.find(p => p.name.toLowerCase() === n);
    const sim = new Simulator(design, { maxWaveEvents: 0 });
    sim.addClock(port('clk').sig, { period: 20000 });
    sim.force(port('rst').sig, V.mk(1, 1n));
    sim.force(port('x').sig, V.mk(1, 0n));
    sim.run(25000);
    sim.force(port('rst').sig, V.mk(1, 0n));
    const got = xs.map((x, k) => {
      const T = 30000 + k * 20000;
      sim.run(T);
      sim.force(port('x').sig, V.mk(1, BigInt(x)));
      sim.run(T + 9000);
      return V.toBin(port('z').sig.val);
    }).join('');
    assert.equal(got, want, lang);
  }
});

test('#405 FSM parts: a diagram as an ASM chart and back: its states and outputs, no error, the same again', () => {
  const d = diagram();
  const once = asmToFsm(fsmToAsm(d));
  assert.deepEqual(once.states.map(s => s.name), d.states.map(s => s.name));
  assert.deepEqual(once.outputs.map(o => o.name), d.outputs.map(o => o.name));
  assert.deepEqual(fsm.validateFsm(fsm.normalizeFsm(once)).filter(x => x.severity === 'error'), []);
  // (a second round trip: the same diagram)
  const twice = asmToFsm(fsmToAsm(fsm.normalizeFsm(once)));
  assert.deepEqual(twice.transitions.map(t => [t.from, t.to, t.cond]), once.transitions.map(t => [t.from, t.to, t.cond]));
});
