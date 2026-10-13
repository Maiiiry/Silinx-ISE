// KISS2 (core/kiss2.js, #205): read into a state machine, written back; '*' rows; the errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromKiss2, toKiss2 } from '../core/kiss2.js';
import { simulateFsm, validateFsm } from '../core/fsm.js';

test('a KISS2 machine read: Mealy, x / y buses, cubes as conditions, the reset state first, names made identifiers', () => {
  const m = fromKiss2('# a comment\n.i 2\n.o 2\n.s 3\n.p 4\n.r 2go\n1- 2go st-1 01\n01 2go 2go 1-\n-- st-1 x 11\n0- x 2go 00\n.e\n', { name: 'k' });
  assert.equal(m.type, 'mealy');
  assert.deepEqual(m.inputs, [{ name: 'x', width: 2 }]);
  assert.deepEqual(m.outputs, [{ name: 'y', width: 2, default: "2'b00" }]);
  assert.deepEqual(m.states.map(s => s.name), ['s_2go', 'st_1', 'x_2']);
  assert.equal(m.initial, 's1');
  assert.deepEqual(m.transitions.map(t => [t.from, t.to, t.cond, t.outputs.y]), [['s1', 's2', 'x[1]', "2'b01"], ['s1', 's1', '!x[1] & x[0]', "2'b10"], ['s2', 's3', '', "2'b11"], ['s3', 's1', '!x[1]', "2'b00"]]);
  assert.deepEqual(validateFsm(m).map(d => `${d.severity}: ${d.message}`), [
    'info: State s_2go: no transition is true when x=00; the machine stays in s_2go',
    'info: State x_2: no transition is true when x=10 (and 1 other combination(s)); the machine stays in x_2',
  ]);
  // no row true: it stays, the outputs at 0
  assert.deepEqual(simulateFsm(m, [{ x: 0 }, { x: 2 }, { x: 0 }]).map(r => [r.state, r.outputs.y]), [['s1', 0n], ['s1', 1n], ['s2', 3n]]);
  assert.equal(toKiss2(m), '.i 2\n.o 2\n.p 4\n.s 3\n.r s_2go\n1- s_2go st_1 01\n01 s_2go s_2go 10\n-- st_1 x_2 11\n0- x_2 s_2go 00\n.e\n');
});

test('KISS2: a 1-bit machine (x, y), \'*\' rows (every state, stay), the errors', () => {
  const m = fromKiss2('.i 1\n.o 1\n0 a b 0\n1 * a 1\n- b * 0\n');
  assert.deepEqual(m.transitions.map(t => [t.from, t.to, t.cond]), [['s1', 's2', '!x'], ['s1', 's1', 'x'], ['s2', 's1', 'x'], ['s2', 's2', '']]);
  for (const [text, re] of [['1 a b 0\n', /\.i and \.o/], ['.i 1\n.o 1\n10 a b 0\n', /line 3: the input '10' is not 1 bits/], ['.i 1\n.o 1\n1 a b 2\n', /line 3: the output '2'/],
    ['.i 1\n.o 1\n1 a b\n', /line 3: a row is input, present state, next state, output/], ['.i 1\n.o 1\n.r z\n1 a b 0\n', /\.r z: no such state/], ['.i 1\n.o 1\n', /no rows/]])
    assert.throws(() => fromKiss2(text), re);
});
