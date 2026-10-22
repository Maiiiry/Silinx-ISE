// The parts of the ASM charts' core (#405: out of core/asm.js): the expression language (asm-expr.js), the
// expressions' VHDL and Verilog (asm-emit.js) and the graph checks of analyze (asm-graph.js); asm.js still exports
// what moved. A condition parsed and written back, an incomplete one's error; a chart's graph: no diagnostic for the
// new chart, a state with no exit an error and unreachable a warning; the expressions of the new chart's generated
// HDL compiled and elaborated with no error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as asm from '../core/asm.js';
import { parseCondition, parseAction, exprToString } from '../core/asm-expr.js';
import { vhExpr, vlExpr, vhAssign, vlAssign } from '../core/asm-emit.js';
import { mountGraphChecks } from '../core/asm-graph.js';
import { generate } from '../core/asm-gen.js';
import { compile, elaborate } from '../core/compile.js';

test('#405 ASM parts: asm.js exports what moved', () => {
  assert.deepEqual([asm.parseCondition, asm.parseAction, asm.exprToString], [parseCondition, parseAction, exprToString]);
  assert.deepEqual([asm.vhExpr, asm.vlExpr, asm.vhAssign, asm.vlAssign], [vhExpr, vlExpr, vhAssign, vlAssign]);
  assert.equal(typeof mountGraphChecks, 'function');
});

test('#405 ASM parts, the expression language: a condition parsed and written back; an incomplete one\'s error', () => {
  assert.equal(exprToString(parseCondition('start = 1 and done = 0').ast), '(start == 1) && (done == 0)');
  assert.equal(exprToString(parseCondition('start').ast), 'start');
  assert.deepEqual(Object.keys(parseAction('busy = 1')), ['target', 'ast']);
  assert.equal(parseCondition('start and (').error, 'unexpected end of expression');
});

test('#405 ASM parts, the graph checks: the new chart clean; a state with no exit, unreachable', () => {
  const m = asm.normalizeModel(asm.newModel('ctl', 'vhdl'));
  assert.deepEqual(asm.analyze(m).diags, []);
  const lost = asm.normalizeModel({ ...m, nodes: [...m.nodes, { id: 'zz', type: 'state', name: 'LOST', x: 0, y: 0, actions: [] }] });
  assert.deepEqual(asm.analyze(lost).diags.map(d => `${d.severity}: ${d.message}`),
    ["error: State 'LOST' has no exit (next state path)", "warning: State 'LOST' is unreachable from the initial state"]);
});

test('#405 ASM parts, the expressions\' HDL: the new chart\'s VHDL and Verilog compile and elaborate', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generate(asm.normalizeModel(asm.newModel('ctl', lang)), lang);
    const lib = compile([{ path: g.filename, lang, text: g.code }]);
    assert.deepEqual(lib.errors, [], lang);
    assert.deepEqual(elaborate(lib, 'ctl').diags, [], lang);
  }
});
