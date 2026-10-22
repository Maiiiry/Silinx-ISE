// core/ink/table.js: a truth table drawn by hand (#1066). Held-out tables (other hands than the templates', drawn
// with a header line and an input / output line, or a full grid with a double one) are read exactly; the rows by
// their lines or their gaps; the names read together on their line (their case by the digits' height); the
// split of the inputs and the outputs; the table's text and the table read back from it, its errors and warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeTable } from '../core/ink/synth-table.js';
import { writeText } from '../core/ink/synth.js';
import { readTable, tableText, tableFromText } from '../core/ink/table.js';
import { recognizeWords, InkError } from '../core/ink/expression.js';

const combos = (n) => [...Array(1 << n).keys()].map((k) => k.toString(2).padStart(n, '0').split(''));
const TABLES = [
  { rows: [['A', 'B', 'F'], ...combos(2).map((r) => [...r, String(r[0] ^ r[1])])] },
  { rows: [['a', 'b', 'c', 'f'], ...combos(3).map((r) => [...r, String((r[0] & r[1]) | r[2])])] },
  { rows: [['A', 'B', 'Cin', 'S', 'Co'], ...combos(3).map(([a, b, c]) => [a, b, c, String(a ^ b ^ c), String((a & b) | (c & (a ^ b)))])], split: 3 },
  { rows: [['x', 'y', 'z'], ['0', '0', '1'], ['0', '1', 'X'], ['1', '0', 'X'], ['1', '1', '0']] },
];
const asRead = (r) => [[...r.inputs, ...r.outputs], ...r.rows];

test('held-out tables drawn by hand are read: 38 of 40 exactly, every cell; a careful hand\'s all', () => {
  let ok = 0, n = 0, cells = 0, cellsOk = 0;
  const wrong = [];
  for (const grid of [false, true]) {
    for (let seed = 1; seed <= 5; seed++) {
      for (const t of TABLES) {
        const r = readTable(writeTable(t.rows, { seed, grid, split: t.split }).strokes);
        n++;
        const good = JSON.stringify(asRead(r)) === JSON.stringify(t.rows) && r.inputs.length === (t.split ?? t.rows[0].length - 1);
        if (good) ok++; else wrong.push(`${grid ? 'grid' : 'lines'} ${seed} ${t.rows[0].join(' ')}: ${r.text.split('\n')[0]}`);
        t.rows.slice(1).forEach((row, i) => row.forEach((c, j) => { cells++; if (r.rows[i]?.[j] === c) cellsOk++; }));
        assert.deepEqual(r.errors, [], `${grid} ${seed} ${t.rows[0]}`);
      }
    }
  }
  assert.ok(ok >= 38, `${ok}/${n}: ${wrong.join('; ')}`);
  assert.equal(cellsOk, cells);
  for (const grid of [false, true]) {
    for (const t of TABLES) {
      const r = readTable(writeTable(t.rows, { seed: 9, grid, split: t.split, amount: 0.4 }).strokes);
      assert.deepEqual(asRead(r), t.rows, `${grid} ${t.rows[0]}`);
      assert.deepEqual([r.errors, r.warnings], [[], []]);
    }
  }
});

test('a full adder drawn by hand: its text, then its columns', () => {
  const t = TABLES[2];
  const r = readTable(writeTable(t.rows, { seed: 9, split: 3, amount: 0.4 }).strokes);
  assert.equal(r.split, 3);
  assert.equal(r.text, ['A B Cin | S Co', ...combos(3).map(([a, b, c]) => `${a} ${b} ${c}   | ${a ^ b ^ c} ${(a & b) | (c & (a ^ b))}`)].join('\n'));
  assert.deepEqual(tableFromText(r.text), { inputs: ['A', 'B', 'Cin'], outputs: ['S', 'Co'], table: { S: '01101001', Co: '00010111' }, warnings: [], errors: [] });
  // the rows in any order
  const shuffled = [r.text.split('\n')[0], ...r.text.split('\n').slice(1).reverse()].join('\n');
  assert.deepEqual(tableFromText(shuffled).table, { S: '01101001', Co: '00010111' });
});

test('the inputs and the outputs: the only upright line, the double one of a grid, else the last column (a warning)', () => {
  const t = TABLES[1];
  assert.equal(readTable(writeTable(t.rows, { seed: 9, amount: 0.4 }).strokes).split, 3);
  assert.equal(readTable(writeTable(t.rows, { seed: 9, amount: 0.4, grid: true }).strokes).split, 3);
  const two = [['a', 'b', 'f', 'g'], ...combos(2).map((r) => [...r, String(r[0] & r[1]), String(r[0] | r[1])])];
  const g = readTable(writeTable(two, { seed: 9, amount: 0.4, grid: true, split: 2 }).strokes);
  assert.deepEqual([g.inputs, g.outputs, g.warnings], [['a', 'b'], ['f', 'g'], []]);
  const none = readTable(writeTable(t.rows, { seed: 9, amount: 0.4, lines: false }).strokes);
  assert.deepEqual(asRead(none), t.rows);
  assert.deepEqual(none.warnings, ['No line between the inputs and the outputs: the last column is the output.']);
  // the rows told apart by their gaps too
  assert.deepEqual(none.rows.length, 8);
});

test('reading errors: no ink, only lines, one row, a cell left empty, a column with no name', () => {
  for (const ink of [[], [[]], null]) assert.throws(() => readTable(ink), (e) => e instanceof InkError && e.message === 'Nothing written: draw the table on the pad.');
  const t = TABLES[0];
  const w = writeTable(t.rows, { seed: 9, amount: 0.4 });
  const lines = w.strokes.slice(-2);
  const inkError = (msg) => (e) => e instanceof InkError && e.message === msg;
  assert.throws(() => readTable(lines), inkError('Only lines: write the names and the values in the table.'));
  assert.throws(() => readTable(writeText('AB', { seed: 1, amount: 0.3 }).strokes), inkError('One row only: write the names in a header and the values in the rows below it.'));
  // the last row's output left empty
  const holes = writeTable([...t.rows.slice(0, 4), ['1', '1', ' ']], { seed: 9, amount: 0.4 });
  const h = readTable(holes.strokes);
  assert.deepEqual(h.errors, ['Row 4, column 3: no value.']);
  assert.equal(h.text.split('\n').at(-1), '1 1 | ?');
  // no name over a column
  const noName = readTable(writeTable([['A', 'B', ' '], ...t.rows.slice(1)], { seed: 9, amount: 0.4 }).strokes);
  assert.deepEqual([noName.outputs, noName.warnings], [['out1'], ['Column 3 has no name: out1.']]);
});

test('the names on a line: read together, their case by the capitals\' height, a word per gap', () => {
  const w = writeText('Cin  S  xy', { seed: 4, amount: 0.3, size: 50 });
  assert.deepEqual(recognizeWords(w.strokes, { capH: 50 }).map((x) => x.text), ['Cin', 'S', 'xy']);
  const all = recognizeWords(w.strokes, { capH: 50 });
  assert.ok(all.every((x, i) => i === 0 || x.box.minX > all[i - 1].box.maxX));
  assert.deepEqual(all.flatMap((x) => x.ink).sort((a, b) => a - b), [...w.strokes.keys()]);
});

test('tableFromText: the names, the rows, the warnings and the errors', () => {
  assert.equal(tableText({ inputs: ['a', 'bb'], outputs: ['f'], rows: [['0', '1', 'X']] }), 'a bb | f\n0 1  | X');
  assert.deepEqual(tableFromText('a, b | f\n0 0 | 0\n0 1 | x\n1 0 | 1\n1 1 | 1'), { inputs: ['a', 'b'], outputs: ['f'], table: { f: '0X11' }, warnings: [], errors: [] });
  // rows missing, repeated
  assert.deepEqual(tableFromText('a b | f\n1 1 | 1\n1 1 | 1'), { inputs: ['a', 'b'], outputs: ['f'], table: { f: '0001' },
    warnings: ['Line 3 repeats line 2.', 'Not in the table: 00, 01, 10 (their outputs are 0).'], errors: [] });
  assert.deepEqual(tableFromText('a b c d | f\n0 0 0 0 | 1').warnings, ['Not in the table: 0001, 0010, 0011, 0100, 0101, 0110, 0111, 1000 and 7 more (their outputs are 0).']);
  const bad = (text) => tableFromText(text).errors;
  assert.deepEqual(bad(''), ['The table is empty.']);
  assert.deepEqual(bad('a b f'), ["Line 1: the names of the inputs, '|', the names of the outputs."]);
  assert.deepEqual(bad('a 1b | f'), ["Line 1: '1b' is not a name."]);
  assert.deepEqual(bad('a A | f'), ["Line 1: 'A' is named twice."]);
  assert.deepEqual(bad('| f'), ['1 to 6 inputs (the table has 0).']);
  assert.deepEqual(bad('a b c d e f g | y'), ['1 to 6 inputs (the table has 7).']);
  assert.deepEqual(bad('a |'), ['At least 1 output.']);
  assert.deepEqual(bad('a b | f\n0 | 1'), ['Line 2: 2 values, 3 expected.']);
  assert.deepEqual(bad('a b | f\n0 X | 1'), ["Line 2: an input is 'X': only 0 or 1."]);
  assert.deepEqual(bad('a b | f\n0 1 | ?'), ["Line 2: an output is '?': only 0, 1 or X."]);
  assert.deepEqual(bad('a b | f\n0 1 | 1\n0 1 | 0'), ['Lines 2 and 3: the inputs 01 with other outputs.']);
  assert.equal(tableFromText('a b | f\n0 1 | 1\n0 1 | 0').table, null);
  assert.deepEqual(tableFromText('a b c | f', { maxInputs: 2 }).errors, ['1 to 2 inputs (the table has 3).']);
});
