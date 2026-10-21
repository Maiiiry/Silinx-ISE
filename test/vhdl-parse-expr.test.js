// The VHDL parser's expressions (core/vhdl/parse-expr.js, #405: out of parser.js), through the parser: the methods
// are the parser's; VHDL's precedence (logical < relational < shift < adding < multiplying < factor: **, abs, not;
// a sign applies to a whole term), the literals (bit strings, strings, characters, physical, based, real), the names
// (slices, attributes, calls), aggregates; and the errors of a broken expression.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../core/vhdl/parser.js';
import { expressionMethods } from '../core/vhdl/parse-expr.js';

// the value of `constant c : <type> := <text>;` in an architecture, and the file's diagnostics
function expr(text, type = 'integer') {
  const r = parse(`library ieee; use ieee.std_logic_1164.all; entity e is end; architecture a of e is
    signal s : std_logic_vector(7 downto 0); constant c : ${type} := ${text}; begin end;`);
  return { value: r.units[0]?.decls.find((d) => d.name === 'c')?.value, errors: r.errors.map((e) => e.message) };
}
const ref = (name) => ({ op: 'ref', name });
const int = (v) => ({ op: 'int', value: String(v) });
const bin = (o, a, b) => ({ op: 'binary', o, a, b });
const lit = (bits, extra = {}) => ({ op: 'lit', bits, signed: false, sized: true, ...extra });

test('#405 VHDL expressions: the parser\'s methods come from parse-expr.js', async () => {
  const names = Object.keys(expressionMethods);
  assert.ok(names.includes('parseExpression') && names.includes('parsePrimary'), names.join(' '));
  // the parser module assigns them to its class: an expression parses only through them
  const { value, errors } = expr('1');
  assert.deepEqual([value, errors], [int(1), []]);
});

test('#405 VHDL expressions: precedence of the operators', () => {
  const cases = [
    ['a and b or c', 'boolean', bin('|', bin('&', ref('a'), ref('b')), ref('c'))],
    ['not a = b', 'boolean', bin('==', { op: 'unary', o: '~', a: ref('a') }, ref('b'))],
    ['1 < 2 xor 3 >= 4', 'boolean', bin('^', bin('<', int(1), int(2)), bin('>=', int(3), int(4)))],
    ['s sll 2', 'std_logic_vector(7 downto 0)', bin('<<', ref('s'), int(2))],
    ['2 + 3 * 4 ** 2', 'integer', bin('+', int(2), bin('*', int(3), bin('**', int(4), int(2))))],
    ['-2 ** 3', 'integer', { op: 'unary', o: '-', a: bin('**', int(2), int(3)) }],
    ['abs x mod 3', 'integer', bin('mod', { op: 'unary', o: 'abs', a: ref('x') }, int(3))],
  ];
  for (const [text, type, want] of cases) assert.deepEqual(expr(text, type), { value: want, errors: [] }, text);
});

test('#405 VHDL expressions: literals, names, calls, aggregates', () => {
  const cases = [
    ['x"0F"', 'std_logic_vector(7 downto 0)', lit('00001111')],
    ['"01Z"', 'std_logic_vector(2 downto 0)', lit('01z', { text: '01Z' })],
    ["'1'", 'std_logic', lit('1', { scalar: true })],
    ['10 ns', 'time', { op: 'phys', value: 10, unit: 'ns' }],
    ['16#FF#', 'integer', int(255)],
    ['2.5e1', 'real', { op: 'real', value: 25 }],
    ["(others => '0')", 'std_logic_vector(7 downto 0)', { op: 'aggregate', items: [{ choices: ['others'], value: lit('0', { scalar: true }) }] }],
    ['s(3 downto 1)', 'std_logic_vector(2 downto 0)', { op: 'slice', base: ref('s'), left: int(3), right: int(1), dir: 'downto' }],
    ["s'length", 'integer', { op: 'attr', prefix: ref('s'), attr: 'length', args: [] }],
    ['to_integer(unsigned(s))', 'integer', { op: 'apply', name: 'to_integer', args: [{ op: 'apply', name: 'unsigned', args: [ref('s')] }] }],
  ];
  for (const [text, type, want] of cases) assert.deepEqual(expr(text, type), { value: want, errors: [] }, text);
});

test('#405 VHDL expressions: a broken expression is reported where it breaks', () => {
  assert.deepEqual(expr('2 + ;').errors, ["expected expression but found ';'", "unexpected ';' in declarative part"]);
  assert.deepEqual(expr('x"0G"').errors, ["'G' is not a hexadecimal digit nor a std_logic value"]);
  assert.deepEqual(expr('(1, 2').errors, ["expected ')' but found ';'"]);
});
