// Unit tests (#1427): a form of a table's output as a circuit (core/logic-cost.js circuitCost: its gates, each symbol
// one whatever its inputs, an inverted input one shared inverter; its delay, the gates on its longest path), and the
// forms of the fewest gates and of the least delay (core/logic.js outputForm 'gates', 'delay'): checked against every
// other form, on random tables, their expressions equal to the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitCost, outputForm, normalizeTable, newTable, exprColumn, parseExpr, generateTableHdl } from '../core/logic.js';

const cost = (src, inputs = ['a', 'b', 'c', 'd']) => circuitCost(parseExpr(src, { inputs }));

test('circuitCost: gates and delay of expressions, an inverted input one shared inverter, NOT of a gate its complement gate', () => {
  assert.deepEqual(circuitCost({ t: 'var', name: 'a' }), { gates: 0, delay: 0 });
  assert.deepEqual(circuitCost({ t: 'const', v: 1 }), { gates: 0, delay: 0 });
  assert.deepEqual(cost('/a'), { gates: 1, delay: 1 });
  assert.deepEqual(cost('a & b & c & d'), { gates: 1, delay: 1 }, 'one AND of 4 inputs: one gate');
  assert.deepEqual(cost('a & /b | c'), { gates: 3, delay: 3 }, 'NOT b, the AND, the OR');
  assert.deepEqual(cost('/a & b | /a & c | /a & d'), { gates: 5, delay: 3 }, 'NOT a once, three ANDs, the OR');
  assert.deepEqual(cost('a ^ b ^ c'), { gates: 1, delay: 1 });
  assert.deepEqual(cost('/(a ^ b)'), { gates: 1, delay: 1 }, 'an XNOR');
  assert.deepEqual(cost('/(a & b) | c'), { gates: 2, delay: 2 }, 'a NAND, the OR');
  assert.deepEqual(circuitCost({ t: 'nand', args: [{ t: 'nand', args: [{ t: 'var', name: 'a' }] }, { t: 'var', name: 'b' }] }), { gates: 2, delay: 2 }, 'a NAND of one input an inverter');
});

const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const randCol = (r, n, dc = 0.15) => Array.from({ length: 1 << n }, () => { const x = r(); return x < dc ? 'X' : x < 0.5 + dc / 2 ? '1' : '0'; }).join('');
const careEqual = (want, got) => [...want].every((c, i) => c === 'X' || c === got[i]);

test('least gates and least delay: the cheapest of the forms by their goal, their expression the table\'s', () => {
  const r = rng(1427);
  for (let k = 0; k < 40; k++) {
    const n = 2 + (k % 5);
    const doc = normalizeTable({ ...newTable(`t${k}`, ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n), ['y']), table: { y: randCol(r, n) } });
    const all = ['sop', 'pos', 'xor', 'nand', 'nor'].map((f) => outputForm(doc, 'y', f));
    for (const goal of ['gates', 'delay']) {
      const b = outputForm(doc, 'y', goal);
      assert.deepEqual(b.cost, circuitCost(b.ast));
      assert.ok(careEqual(doc.table.y, exprColumn(b.ast, doc.inputs)), `${goal} ${doc.table.y}`);
      for (const o of all) {
        const [x, y] = goal === 'gates' ? [b.cost.gates, o.cost.gates] : [b.cost.delay, o.cost.delay];
        assert.ok(x <= y, `${goal}: ${JSON.stringify(b.cost)} (${b.form}) vs ${JSON.stringify(o.cost)} (${o.form})`);
        if (x === y) assert.ok((goal === 'gates' ? b.cost.delay <= o.cost.delay : b.cost.gates <= o.cost.gates), `${goal}: the tie broken by the other`);
      }
      assert.match(b.what, new RegExp(`^least ${goal}: .*, ${b.cost.gates} gate\\(s\\), delay ${b.cost.delay}$`));
    }
  }
});

test('least gates and least delay: a parity is its XOR, a majority its minimal SOP; the HDL says which, its gates and delay', () => {
  const doc = normalizeTable({ ...newTable('t', ['a', 'b', 'c'], ['p', 'm']), table: { p: '01101001', m: '00010111' } });
  for (const goal of ['gates', 'delay']) {
    assert.deepEqual([outputForm(doc, 'p', goal).form, outputForm(doc, 'p', goal).cost], ['xor', { gates: 1, delay: 1 }]);
    assert.deepEqual([outputForm(doc, 'm', goal).form, outputForm(doc, 'm', goal).cost], ['sop', { gates: 4, delay: 2 }]);
    const hdl = generateTableHdl({ ...doc, form: goal }, 'vhdl').code;
    assert.match(hdl, new RegExp(`-- p = .*\\(least ${goal}: XOR form, 3 literal\\(s\\), 1 gate\\(s\\), delay 1\\)`));
    assert.match(hdl, new RegExp(`-- m = .*\\(least ${goal}: minimal SOP, 6 literal\\(s\\), 4 gate\\(s\\), delay 2\\)`));
  }
});
