// Stimuli drawn in the simulator (core/stimuli.js, #336): the model (cells painted as the HDL Bencher does,
// the timing, the ports), the simulation it drives compared with an independent model of the design, and the
// test bench made from it (core/testbench.js) passing in VHDL and Verilog — failing on a wrong expected value
// exactly where checkExpected says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { tbPorts, generateTestbench } from '../core/testbench.js';
import {
  newStimuli, normalizeStimuli, cyclePs, nextBit, nextExpected, paintCells, editInput, editExpected, stimulusPlan,
  paintBit, editInputBit, editExpectedBit, checkExpected, fillExpected, testbenchOptions, applyStimuli, MAX_CYCLES,
} from '../core/stimuli.js';

const COUNTER_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity counter is
  port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0); tc : out std_logic);
end counter;
architecture rtl of counter is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
  tc <= '1' when c = "1111" else '0';
end rtl;`;
const COUNTER_V = `module counter (input clk, input rst, input en, output reg [3:0] q = 0, output tc);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + 1;
  assign tc = &q;
endmodule`;
// combinational, with a bus input: y = a and b, s = d + 1
const GATE_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity g is
  port (a, b : in std_logic; d : in std_logic_vector(2 downto 0); y : out std_logic; s : out std_logic_vector(2 downto 0));
end g;
architecture rtl of g is
begin
  y <= a and b;
  s <= std_logic_vector(unsigned(d) + 1);
end rtl;`;
const GATE_V = `module g (input a, input b, input [2:0] d, output y, output [2:0] s);
  assign y = a & b;
  assign s = d + 1;
endmodule`;

// #919: a bus edited one bit at a time; d descending, v ascending (its bit 0 the leftmost): s = d + 1, y = v(0) and not v(2)
const BITS_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity h is
  port (d : in std_logic_vector(2 downto 0); v : in std_logic_vector(0 to 2); s : out std_logic_vector(2 downto 0); y : out std_logic);
end h;
architecture rtl of h is
begin
  s <= std_logic_vector(unsigned(d) + 1);
  y <= v(0) and not v(2);
end rtl;`;
const BITS_V = `module h (input [2:0] d, input [0:2] v, output [2:0] s, output y);
  assign s = d + 1;
  assign y = v[0] & ~v[2];
endmodule`;

const src = (text, lang, name) => ({ path: `${name}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text });
const types = { q: 'std_logic_vector(3 downto 0)', d: 'std_logic_vector(2 downto 0)', s: 'std_logic_vector(2 downto 0)', v: 'std_logic_vector(0 to 2)' };

// the module simulated with the model's stimuli, as the wave window does: { ports, sim, valueAt(port, t) }
function runModel(dut, top, m) {
  const design = elaborate(compile([dut]), top);
  assert.deepEqual(design.diags.filter(d => d.severity === 'error'), []);
  const ports = tbPorts(design, types);
  const sim = new Simulator(design);
  const sigOf = n => design.top.ports.find(p => p.name === n)?.sig || null;
  const plan = applyStimuli(sim, sigOf, normalizeStimuli(m, ports));
  sim.run(plan.endPs);
  return { ports, sim, valueAt: (port, t) => V.toBin(sim.valueAt(sigOf(port), t)) };
}
// the generated test bench run in the simulator: its log lines; its warnings and errors (none when it passes:
// the elaboration's warnings too)
function runTb(dut, tbText, lang, name) {
  const r = simulate([dut, src(tbText, lang, name)], name, { until: 1e12 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], tbText);
  const log = r.sim.log.map(l => l.text);
  log.problems = [...r.design.diags.filter(d => d.severity === 'warning').map(d => d.message), ...r.sim.log.filter(l => l.kind === 'warning' || l.kind === 'error' || l.kind === 'failure').map(l => l.text)];
  return log;
}

test('stimuli model: new / normalised for the ports (clock, widths, values, cycles, ports added and removed)', () => {
  const ports = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'a', dir: 'in', width: 1 }, { name: 'd', dir: 'in', width: 3 },
    { name: 'y', dir: 'out', width: 1 }, { name: 's', dir: 'out', width: 3 }, { name: 'io', dir: 'inout', width: 1 }];
  const m = newStimuli(ports, { clock: 'clk', cycles: 4 });
  assert.deepEqual(m, { version: 1, clock: 'clk', periodNs: 20, stepNs: 10, cycles: 4,
    inputs: { a: ['0', '0', '0', '0'], d: ['000', '000', '000', '000'] }, expected: { y: ['-', '-', '-', '-'], s: ['---', '---', '---', '---'] } });
  assert.equal(cyclePs(m), 20000);
  // the clock must be a 1-bit input; bad cells take the value before; lower case made upper; timing in range
  const n = normalizeStimuli({ clock: 'd', periodNs: 0, stepNs: -3, cycles: 3, inputs: { a: ['1', 'q', 'z'], d: ['1x0', '11'], gone: ['1'] }, expected: { y: ['1', '-', '2'] } }, ports);
  assert.deepEqual([n.clock, n.periodNs, n.stepNs, n.cycles], [null, 2, 1, 3]);
  assert.deepEqual(n.inputs, { clk: ['0', '0', '0'], a: ['1', '1', 'Z'], d: ['1X0', '1X0', '1X0'] });
  assert.deepEqual(n.expected, { y: ['1', '-', '-'], s: ['---', '---', '---'] });
  // more cycles: the last value goes on; at most MAX_CYCLES; a port renamed: the new one starts at 0
  const longer = normalizeStimuli({ ...m, cycles: 6, inputs: { ...m.inputs, a: ['0', '1', '1', '0'] } }, ports);
  assert.deepEqual(longer.inputs.a, ['0', '1', '1', '0', '0', '0']);
  assert.equal(normalizeStimuli({ ...m, cycles: 1e6 }, ports).cycles, MAX_CYCLES);
  assert.deepEqual(normalizeStimuli(m, [{ name: 'b', dir: 'in', width: 2 }]).inputs, { b: ['00', '00', '00', '00'] });
  assert.equal(normalizeStimuli(null, ports).cycles, 16);
});

test('stimuli model: a click paints from its cycle up to the next change, 0 → 1 → Z → X; expected - → 0 → 1', () => {
  assert.deepEqual(['0', '1', 'Z', 'X', 'z', '?'].map(nextBit), ['1', 'Z', 'X', '0', 'X', '0']);
  assert.deepEqual(['-', '0', '1', 'x'].map(nextExpected), ['0', '1', '-', '-']);
  assert.deepEqual(paintCells(['0', '0', '1', '1', '0'], 0, '1'), ['1', '1', '1', '1', '0']);
  assert.deepEqual(paintCells(['0', '0', '1', '1', '0'], 3, '0'), ['0', '0', '1', '0', '0']);
  assert.deepEqual(paintCells(['0'], 5, '1'), ['0']);
  const m = newStimuli([{ name: 'a', dir: 'in', width: 1 }, { name: 'd', dir: 'in', width: 2 }, { name: 'y', dir: 'out', width: 1 }], { cycles: 6 });
  assert.equal(editInput(m, 'a', 2), true);
  assert.deepEqual(m.inputs.a, ['0', '0', '1', '1', '1', '1']);
  assert.equal(editInput(m, 'a', 4), true);
  assert.deepEqual(m.inputs.a, ['0', '0', '1', '1', 'Z', 'Z']);
  // only up to the next change: cells 0 and 1 to 1 join the run of 1s
  assert.equal(editInput(m, 'a', 0, '1'), true);
  assert.deepEqual(m.inputs.a, ['1', '1', '1', '1', 'Z', 'Z']);
  assert.equal(editInput(m, 'a', 1, '1'), false, 'already 1');
  assert.equal(editInput(m, 'd', 1, '1z'), true);
  assert.deepEqual(m.inputs.d, ['00', '1Z', '1Z', '1Z', '1Z', '1Z']);
  // errors: a bus without a value, a wrong width or bit, an unknown port, a cycle out of range: no change
  assert.deepEqual([editInput(m, 'd', 0, '1'), editInput(m, 'd', 0, '12'), editInput(m, 'q', 0), editInput(m, 'a', 9), editInput(m, 'a', -1)], [false, false, false, false, false]);
  assert.equal(editInput(m, 'd', 0), false, 'a bus needs its value');
  assert.equal(editExpected(m, 'y', 3), true);
  assert.deepEqual(m.expected.y, ['-', '-', '-', '0', '0', '0']);
  assert.deepEqual([editExpected(m, 'y', 0, 'Z'), editExpected(m, 'y', 0, '-')], [false, false]);
});

test('stimuli model (#919): one bit of a bus painted from its cycle up to its next change, the other bits kept; the whole bus after', () => {
  assert.deepEqual(paintBit(['000', '000', '010', '010', '000'], 1, 1, '1'), ['000', '010', '010', '010', '000']);
  assert.deepEqual(paintBit(['000', '001', '011', '001'], 0, 2, '1'), ['001', '001', '011', '001'], 'up to the bit\'s change, whatever the other bits do');
  assert.deepEqual(paintBit(['00'], 0, 5, '1'), ['00']);
  const m = newStimuli([{ name: 'd', dir: 'in', width: 3 }, { name: 's', dir: 'out', width: 3 }], { cycles: 5 });
  // a click: 0 → 1 → Z → X → 0, as a 1-bit input; bit 2 (the LSB) from cycle 1, bit 0 (the MSB) from cycle 3
  assert.equal(editInputBit(m, 'd', 2, 1), true);
  assert.deepEqual(m.inputs.d, ['000', '001', '001', '001', '001']);
  assert.equal(editInputBit(m, 'd', 0, 3), true);
  assert.deepEqual(m.inputs.d, ['000', '001', '001', '101', '101']);
  assert.deepEqual([2, 3, 4].map(() => (editInputBit(m, 'd', 1, 4), m.inputs.d[4])), ['111', '1Z1', '1X1']);
  assert.equal(editInputBit(m, 'd', 1, 4), true);
  assert.equal(m.inputs.d[4], '101', 'X → 0');
  // a value given; the bit already that, a bit not 0 1 Z X, out of range, unknown port: no change
  assert.equal(editInputBit(m, 'd', 2, 0, 'z'), true);
  assert.deepEqual(m.inputs.d, ['00Z', '001', '001', '101', '101']);
  assert.deepEqual([editInputBit(m, 'd', 2, 0, 'Z'), editInputBit(m, 'd', 2, 0, '01'), editInputBit(m, 'd', 2, 0, '-'), editInputBit(m, 'd', 3, 0),
    editInputBit(m, 'd', -1, 0), editInputBit(m, 'd', 0.5, 0), editInputBit(m, 'd', 0, 5), editInputBit(m, 'e', 0, 0), editInputBit(m, 's', 0, 0)],
  [false, false, false, false, false, false, false, false, false]);
  // back to the whole bus: its value from cycle 1, up to the bus's next change (cycle 3)
  assert.equal(editInput(m, 'd', 1, '110'), true);
  assert.deepEqual(m.inputs.d, ['00Z', '110', '110', '101', '101']);
  // an output's bit: - → 0 → 1 → -, the other bits not checked
  assert.equal(editExpectedBit(m, 's', 0, 2), true);
  assert.deepEqual(m.expected.s, ['---', '---', '0--', '0--', '0--']);
  assert.equal(editExpectedBit(m, 's', 0, 4), true);
  assert.deepEqual(m.expected.s, ['---', '---', '0--', '0--', '1--']);
  assert.equal(editExpectedBit(m, 's', 2, 3, '1'), true);
  assert.deepEqual(m.expected.s, ['---', '---', '0--', '0-1', '1-1']);
  assert.deepEqual([editExpectedBit(m, 's', 2, 3, '1'), editExpectedBit(m, 's', 2, 3, 'Z'), editExpectedBit(m, 'd', 0, 0)], [false, false, false]);
  assert.equal(editExpectedBit(m, 's', 0, 4), true);
  assert.equal(m.expected.s[4], '--1', '1 → -');
  // checked bit by bit: only the bits expected
  const got = { s: ['000', '000', '011', '110', '000'] };
  assert.deepEqual(checkExpected(m, (p, t) => got[p][Math.floor(t / cyclePs(m))]), [{ port: 's', k: 3, expected: '0-1', got: '110' }, { port: 's', k: 4, expected: '--1', got: '000' }]);
  // saved and read back: the same
  assert.deepEqual(normalizeStimuli(JSON.parse(JSON.stringify(m)), [{ name: 'd', dir: 'in', width: 3 }, { name: 's', dir: 'out', width: 3 }]), m);
});

test('stimuli plan: input changes, the clock, check times (with a clock and combinational)', () => {
  const ports = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'en', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 4 }];
  const m = newStimuli(ports, { clock: 'clk', periodNs: 10, cycles: 3 });
  m.inputs.en = ['0', '1', '1'];
  assert.deepEqual(stimulusPlan(m), { endPs: 30000, clock: { port: 'clk', periodPs: 10000 }, changes: { en: [{ t: 0, bits: '0' }, { t: 10000, bits: '1' }] }, checks: [9999, 19999, 29999] });
  const c = newStimuli(ports, { stepNs: 5, cycles: 2 });
  assert.deepEqual(stimulusPlan(c), { endPs: 10000, clock: null, changes: { clk: [{ t: 0, bits: '0' }], en: [{ t: 0, bits: '0' }] }, checks: [4999, 9999] });
});

for (const [lang, dut] of [['vhdl', src(COUNTER_VHD, 'vhdl', 'counter')], ['verilog', src(COUNTER_V, 'verilog', 'counter')]]) {
  test(`stimuli with a clock (${lang}): the simulation matches an independent model, the test bench passes, a wrong expected value fails there`, () => {
    const ports0 = tbPorts(elaborate(compile([dut]), 'counter'), types);
    const m = newStimuli(ports0, { clock: 'clk', periodNs: 20, cycles: 20 });
    // rst for cycle 0, en from cycle 2 to 18 (Bencher clicks), so that q counts to 15 (tc) and wraps
    editInput(m, 'rst', 0); editInput(m, 'rst', 1, '0');
    editInput(m, 'en', 2); editInput(m, 'en', 18, '0');
    assert.deepEqual(m.inputs.rst.join(''), '10000000000000000000');
    assert.deepEqual(m.inputs.en.join(''), '00111111111111111100');
    const r = runModel(dut, 'counter', m);
    // independent model: at the rising edge of cycle k (in its middle) the counter takes the inputs of cycle k
    let c = 0;
    const want = [];
    for (let k = 0; k < m.cycles; k++) {
      if (m.inputs.rst[k] === '1') c = 0; else if (m.inputs.en[k] === '1') c = (c + 1) & 15;
      want.push({ q: c.toString(2).padStart(4, '0'), tc: c === 15 ? '1' : '0' });
    }
    fillExpected(m, r.valueAt);
    assert.deepEqual(m.expected.q, want.map(w => w.q));
    assert.deepEqual(m.expected.tc, want.map(w => w.tc));
    assert.deepEqual(checkExpected(m, r.valueAt), []);
    // the test bench of the model passes; with one expected bit wrong, it fails at that vector, as checkExpected does
    const tb = (mm, name) => generateTestbench(testbenchOptions(mm, { name, lang, uut: { name: 'counter' }, ports: r.ports }));
    const log = runTb(dut, tb(m, 'counter_tbw'), lang, 'counter_tbw');
    assert.ok(log.some(l => /TEST PASSED: 20 vector/.test(l)), log.join('\n'));
    assert.deepEqual(log.problems, [], 'no warnings');
    m.expected.tc[7] = '1';
    assert.deepEqual(checkExpected(m, r.valueAt), [{ port: 'tc', k: 7, expected: '1', got: '0' }]);
    const bad = runTb(dut, tb(m, 'counter_bad'), lang, 'counter_bad');
    assert.ok(bad.some(l => /^vector 7:/.test(l)), bad.join('\n'));
    assert.ok(bad.some(l => /TEST FAILED: 1 of 20 vector/.test(l)), bad.join('\n'));
    // (VHDL: the vector's report and TEST FAILED are errors; Verilog: $display lines)
    assert.deepEqual(bad.problems.map(t => t.replace(/:.*/, '')), lang === 'vhdl' ? ['vector 7', 'TEST FAILED'] : []);
  });
}

for (const [lang, dut] of [['vhdl', src(GATE_VHD, 'vhdl', 'g')], ['verilog', src(GATE_V, 'verilog', 'g')]]) {
  test(`combinational stimuli with Z / X inputs and a bus (${lang}): unknown outputs not expected, the test bench passes`, () => {
    const ports0 = tbPorts(elaborate(compile([dut]), 'g'), types);
    const m = newStimuli(ports0, { stepNs: 10, cycles: 6 });
    // a: 0 1 Z X 1 1, b: 1, d: 0 1 2 3 7 7
    m.inputs.a = ['0', '1', 'Z', 'X', '1', '1']; m.inputs.b = ['1', '1', '1', '1', '1', '1'];
    m.inputs.d = ['000', '001', '010', '011', '111', '111'];
    const r = runModel(dut, 'g', m);
    fillExpected(m, r.valueAt);
    assert.deepEqual(m.expected.y, ['0', '1', '-', '-', '1', '1'], 'Z and 1, X and 1: X, not expected');
    assert.deepEqual(m.expected.s, ['001', '010', '011', '100', '000', '000']);
    assert.deepEqual(checkExpected(m, r.valueAt), []);
    const tb = generateTestbench(testbenchOptions(m, { name: 'g_tbw', lang, uut: { name: 'g' }, ports: r.ports }));
    // the vector of cycle 2: a b d = Z 1 010
    assert.match(tb, lang === 'vhdl' ? /2 => "Z1010"/ : /vin\[2\] = 5'bz1010;/);
    const log = runTb(dut, tb, lang, 'g_tbw');
    assert.ok(log.some(l => /TEST PASSED: 6 vector/.test(l)), log.join('\n'));
    assert.deepEqual(log.problems, [], 'no warnings');
  });
}

for (const [lang, dut] of [['vhdl', src(BITS_VHD, 'vhdl', 'h')], ['verilog', src(BITS_V, 'verilog', 'h')]]) {
  test(`stimuli with buses edited one bit at a time (#919, ${lang}): the simulation and the test bench drive each bit as edited`, () => {
    const ports0 = tbPorts(elaborate(compile([dut]), 'h'), types);
    const m = newStimuli(ports0, { stepNs: 10, cycles: 8 });
    // d's bits: d(0) 1 from cycle 1, d(1) from cycle 2 to 5, d(2) from cycle 4; v's bits (ascending): v(0) from cycle 3,
    // v(2) from cycle 6; then d whole from cycle 7: 010
    editInputBit(m, 'd', 2, 1);
    editInputBit(m, 'd', 1, 2); editInputBit(m, 'd', 1, 6, '0');
    editInputBit(m, 'd', 0, 4);
    editInputBit(m, 'v', 0, 3);
    editInputBit(m, 'v', 2, 6);
    editInput(m, 'd', 7, '010');
    assert.deepEqual(m.inputs.d, ['000', '001', '011', '011', '111', '111', '101', '010']);
    assert.deepEqual(m.inputs.v, ['000', '000', '000', '100', '100', '100', '101', '101']);
    // expected: s's MSB, s(2), bit by bit: 1 in cycles 2, 3 and 6, 0 in 4, 5 and 7 (the others not checked)
    editExpectedBit(m, 's', 0, 2, '1');
    editExpectedBit(m, 's', 0, 4, '0');
    editExpectedBit(m, 's', 0, 6, '1'); editExpectedBit(m, 's', 0, 7, '0');
    assert.deepEqual(m.expected.s, ['---', '---', '1--', '1--', '0--', '0--', '1--', '0--']);
    // an independent model: s = d + 1, y = v(0) and not v(2), v's leftmost bit being v(0)
    const r = runModel(dut, 'h', m);
    const want = m.inputs.d.map(d => ((parseInt(d, 2) + 1) & 7).toString(2).padStart(3, '0'));
    const checks = stimulusPlan(m).checks;
    assert.deepEqual(checks.map(t => r.valueAt('s', t)), want);
    assert.deepEqual(checks.map(t => r.valueAt('y', t)), m.inputs.v.map(v => (v[0] === '1' && v[2] === '0' ? '1' : '0')));
    assert.deepEqual(checkExpected(m, r.valueAt), []);
    // the test bench: the vectors as edited (d v, cycle 6: 101 101), it passes; with one expected bit wrong, it fails there
    const tb = (mm, name) => generateTestbench(testbenchOptions(mm, { name, lang, uut: { name: 'h' }, ports: r.ports }));
    const text = tb(m, 'h_tbw');
    assert.match(text, lang === 'vhdl' ? /6 => "101101"/ : /vin\[6\] = 6'b101101;/);
    const log = runTb(dut, text, lang, 'h_tbw');
    assert.ok(log.some(l => /TEST PASSED: 8 vector/.test(l)), log.join('\n'));
    assert.deepEqual(log.problems, [], 'no warnings');
    editExpectedBit(m, 's', 2, 2, '1'); editExpectedBit(m, 's', 2, 3, '-');
    assert.deepEqual(m.expected.s, ['---', '---', '1-1', '1--', '0--', '0--', '1--', '0--']);
    assert.deepEqual(checkExpected(m, r.valueAt), [{ port: 's', k: 2, expected: '1-1', got: '100' }]);
    const bad = runTb(dut, tb(m, 'h_bad'), lang, 'h_bad');
    assert.ok(bad.some(l => /^vector 2:/.test(l)), bad.join('\n'));
    assert.ok(bad.some(l => /TEST FAILED: 1 of 8 vector/.test(l)), bad.join('\n'));
  });
}

test('test bench generator: Z / X only on std_logic inputs, startAtZero without the first wait', () => {
  const ports = [{ name: 'n', dir: 'in', width: 4, kind: 'int', left: null, right: null, desc: true, bus: false }, { name: 'y', dir: 'out', width: 1, kind: 'sl' }];
  assert.throws(() => generateTestbench({ name: 't', uut: { name: 'u' }, ports, vectors: [{ in: { n: '00Z0' } }] }), /input n must be 0\/1 bits/);
  assert.throws(() => generateTestbench({ name: 't', uut: { name: 'u' }, ports, vectors: [{ in: { n: '0020' } }] }), /inputs must be 0\/1 bits/);
  const sl = [{ name: 'clk', dir: 'in', width: 1, kind: 'sl' }, { name: 'a', dir: 'in', width: 1, kind: 'sl' }, { name: 'y', dir: 'out', width: 1, kind: 'sl' }];
  for (const lang of ['vhdl', 'verilog']) {
    const o = { name: 't', lang, uut: { name: 'u' }, ports: sl, clock: { port: 'clk', periodNs: 20 }, vectors: [{ in: { a: 'X' } }] };
    const first = lang === 'vhdl' ? /begin\n    for k in 0 to NV - 1 loop/ : /errors = 0;\n    for \(k = 0/;
    assert.doesNotMatch(generateTestbench(o), first, 'waits for the first falling edge');
    assert.match(generateTestbench({ ...o, startAtZero: true }), first);
    assert.match(generateTestbench({ ...o, startAtZero: true }), /inputs change at the falling edge \(the first at time 0\)/);
  }
});

// the gates example (a prime detector: both LEDs on for 2, 3, 5, 7, 11, 13) has its stimuli: sw counting 0 … 15,
// the expected outputs those of an independent model, matched by the simulation
test('the gates example: its saved stimuli, every value of sw, expected outputs the primes, matched by the simulation', async () => {
  const fs = await import('node:fs');
  const pj = JSON.parse(fs.readFileSync(new URL('../examples/gates/silinx.json', import.meta.url), 'utf8'));
  const dut = src(fs.readFileSync(new URL('../examples/gates/src/gates.vhd', import.meta.url), 'utf8'), 'vhdl', 'gates');
  const m = pj.stimuli.gates;
  const prime = n => n > 1 && [...Array(n).keys()].slice(2).every(d => n % d);
  assert.deepEqual(m.inputs.sw, [...Array(16).keys()].map(n => n.toString(2).padStart(4, '0')));
  assert.deepEqual(m.expected.led, [...Array(16).keys()].map(n => (prime(n) ? '11' : '00')));
  const r = runModel(dut, 'gates', m);
  assert.deepEqual(normalizeStimuli(m, r.ports), m, 'saved as normalised');
  assert.deepEqual(checkExpected(m, r.valueAt), []);
});
