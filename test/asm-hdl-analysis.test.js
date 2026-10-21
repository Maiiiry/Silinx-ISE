// The analysis of an HDL module for the recovery of its ASM chart (core/asm-hdl-analysis.js, #405: out of
// asm-from-hdl.js), loaded first (the module and asm-from-hdl.js import each other): the generator's header read back,
// none in a hand-written file; the state machine of the chart's generated VHDL and Verilog (its states, the initial one,
// the clock, the reset, the inputs, the state register's width); a module that is no state machine refused, in user
// terms; the small helpers in asm-hdl-util.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeader, analyzeModule } from '../core/asm-hdl-analysis.js';
import { lineOf, atLine, stmtList, bitsValue, evalInt } from '../core/asm-hdl-util.js';
import { newModel, generate } from '../core/asm.js';
import { parse as parseVhdl } from '../core/vhdl/parser.js';
import { parse as parseVerilog } from '../core/verilog/parser.js';

const code = (g) => (typeof g === 'string' ? g : g.code ?? Object.values(g)[0]);

test('#405 ASM from HDL, the analysis: the chart\'s generated VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = newModel('ctl', lang);
    const src = code(generate(m, lang));
    // the header: the chart's name, encoding and, per state, the spelling of its conditions and actions
    const hd = parseHeader(src, lang);
    assert.deepEqual([hd.name, hd.description, hd.encoding], ['ctl', null, 'binary'], lang);
    assert.deepEqual([...hd.states.keys()], ['IDLE', 'RUN', 'FINISH'], lang);
    assert.deepEqual(hd.states.get('IDLE').conds, ['start'], lang);
    assert.deepEqual(hd.states.get('FINISH').moore, ['busy = 1', 'ready = 1'], lang);
    assert.equal(hd.always.size + hd.regInit.size, 0, lang);
    const mod = (lang === 'vhdl' ? parseVhdl : parseVerilog)(src).units.find((u) => u.kind === 'module');
    const a = analyzeModule(mod, src, lang);
    assert.deepEqual(a.states.map((s) => s.name), ['IDLE', 'RUN', 'FINISH'], lang);
    assert.equal(a.initial.name, 'IDLE', lang);
    assert.equal(a.clock, 'clk', lang);
    assert.deepEqual(a.reset, { name: 'rst', active: 'high', sync: false }, lang);
    assert.deepEqual(a.inputs, ['start', 'done'], lang);
    assert.equal(a.sWidth, 2, lang);
    assert.deepEqual(a.warnings, [], lang);
  }
});

test('#405 ASM from HDL, the analysis: no header in a hand-written file; what is no state machine refused', () => {
  const comb = 'module comb(input a, b, output y); assign y = a & b; endmodule';
  assert.equal(parseHeader(comb, 'verilog'), null);
  assert.throws(() => analyzeModule(parseVerilog(comb).units[0], comb, 'verilog'),
    { message: 'no clocked process found: the module has no state register, so it is not a state machine' });
  const noReset = 'module t(input clk, input a, output reg q); always @(posedge clk) q <= a; endmodule';
  assert.throws(() => analyzeModule(parseVerilog(noReset).units[0], noReset, 'verilog'),
    { message: 'clocked process at line 1 has no reset: the state register must be reset to the initial state' });
});

test('#405 ASM from HDL, the helpers: locations, statement lists, bit strings, constant integers', () => {
  assert.equal(lineOf({ line: 7 }), 7);
  assert.equal(lineOf(null), null);
  assert.equal(atLine({ line: 7 }), ' at line 7');
  assert.equal(atLine({}), '');
  const s = { kind: 'assign' };
  assert.deepEqual(stmtList(null), []);
  assert.deepEqual(stmtList([s]), [s]);
  assert.equal(bitsValue('0101'), 5n);
  assert.equal(evalInt({ op: 'int', value: '12' }, new Map()), 12n);
});
