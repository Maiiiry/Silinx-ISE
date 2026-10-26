// Silinx C (#1524): the preprocessor and lexer (core/c-lex.js), the parser (core/c-parse.js), the checks
// (core/c-check.js) and the help of their messages (core/hints-c.js): valid sources, sources with errors and the
// exact messages, positions included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex } from '../core/c-lex.js';
import { parse } from '../core/c-parse.js';
import { checkC, constValue } from '../core/c-check.js';
import { hintFor } from '../core/hints.js';

const msgs = (src) => checkC(src, 't.c').diagnostics.map((d) => `${d.line}:${d.col} ${d.severity}: ${d.message}`);

test('lex: numbers (decimal, hex, binary, octal, suffixes, separators), characters and their escapes, strings, comments, continued lines', () => {
  const r = lex("int a = 0x1F + 0b101 + 017 + 10u + 5UL + 1'000; // c\nchar c = '\\n'; /* a\n b */ char d = '\\x41';\nconst char *s = \"a\\\"b\";\n#define L 1 + \\\n 2\nint e = L;");
  assert.deepEqual(r.errors, []);
  const nums = r.tokens.filter((t) => t.t === 'num').map((t) => t.v);
  assert.deepEqual(nums, ['0x1F', '0b101', '017', '10u', '5UL', "1'000", '1', '2']);
  assert.deepEqual(r.tokens.filter((t) => t.t === 'chr').map((t) => t.v), [10, 65]);
  assert.deepEqual(r.tokens.filter((t) => t.t === 'str').map((t) => t.v), ['a"b']);
  // positions: 'char d' on line 3 (the block comment's lines counted), the macro's tokens at its use
  const d = r.tokens.find((t) => t.v === 'd');
  assert.deepEqual([d.line, d.col], [3, 12]);
  const e = r.tokens.find((t) => t.v === 'e');
  assert.equal(e.line, 7);
  assert.deepEqual(r.tokens.filter((t) => t.line === 7).map((t) => t.v), ['int', 'e', '=', '1', '+', '2', ';']);
});

test('lex: #if / #ifdef / #ifndef / #elif / #else / #endif with defined() and constant expressions; function-like macros', () => {
  const src = `#define W 8
#define SQ(x) ((x) * (x))
#if W > 4 && defined(W)
int big = SQ(W + 1);
#elif W == 4
int mid;
#else
int small;
#endif
#ifndef NOPE
int yes;
#endif
#ifdef NOPE
int no;
#endif`;
  const r = lex(src);
  assert.deepEqual(r.errors, []);
  const ids = r.tokens.filter((t) => t.t === 'id').map((t) => t.v);
  assert.deepEqual(ids, ['int', 'big', 'W', 'W', 'int', 'yes'].filter((x) => x !== 'W'));
  // SQ(W + 1) -> ((8 + 1) * (8 + 1))
  assert.equal(r.tokens.filter((t) => t.line === 4).map((t) => t.v).join(''), 'intbig=(((8+1))*((8+1)));');
  assert.equal(String(eval(r.tokens.filter((t) => t.line === 4 && t.t !== 'id').slice(1, -1).map((t) => t.v).join(''))), '81');
});

test('lex: pragmas (HLS parsed, others dropped with a warning); headers known and refused; directives with errors', () => {
  const r = lex('#include "ap_int.h"\n#include <stdlib.h>\n#include <hls_stream.h>\n#pragma HLS PIPELINE II=2 rewind\n#pragma once\n#pragma HLS INTERFACE mode=ap_vld port=y\n#if 1\n#else\n#else\n#endif\n#endif\n#foo\n#if 1\n');
  assert.deepEqual(r.includes.map((i) => [i.name, i.system]), [['ap_int.h', false], ['stdlib.h', true], ['hls_stream.h', true]]);
  assert.deepEqual(r.pragmas.map((p) => [p.name, p.args]), [['PIPELINE', { ii: '2', rewind: true }], ['INTERFACE', { mode: 'ap_vld', port: 'y' }]]);
  assert.deepEqual(r.errors.map((e) => `${e.line} ${e.severity}: ${e.message}`), [
    "2 error: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h)",
    '3 error: hls_stream.h: streams are not supported yet',
    '5 warning: #pragma once is ignored (only #pragma HLS)',
    '11 error: #endif with no #if',
    '12 error: #foo is not supported',
    '13 error: #if with no #endif',
  ]);
});

test('parse: types (C, stdint, bool, ap_int<W> / ap_uint<W>, typedef), declarators (arrays, pointers), functions, statements, expressions with C precedence', () => {
  const r = parse(`#include "ap_int.h"
#include <stdint.h>
typedef ap_uint<12> word;
static const int K = 3;
int16_t g[2][3];
word f(ap_int<5> a, unsigned char *p, bool b[4]) {
  int x = 1 + 2 * 3 << 1 == 14 && !b[0] ? a : -a;
  for (int i = 0; i < 4; i++) { if (b[i]) continue; else x += i; }
  do x--; while (x > 0);
  switch (x) { case 1: x = 2; break; default: x = 0; }
  *p = (unsigned char)x;
  return ap_uint<12>(x) + a.range(3, 0) + a[4];
}`, 't.c');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.items.map((i) => `${i.kind} ${i.name}`), ['typedef word', 'var K', 'var g', 'func f']);
  const f = r.items[3];
  assert.deepEqual([f.ret.name, f.ret.ap, f.params.map((p) => p.type.kind)], ['word', true, ['int', 'ptr', 'array']]);
  assert.deepEqual(f.body.items.map((s) => s.kind), ['decl', 'for', 'do', 'switch', 'expr', 'return']);
  // 1 + 2 * 3 << 1 == 14 && !b[0] ? a : -a  ->  cond(&&(==(<<(+(1, *(2,3)), 1), 14), !b[0]), a, -a)
  const e = f.body.items[0].vars[0].init;
  assert.equal(e.kind, 'cond');
  assert.equal(e.c.op, '&&');
  assert.equal(e.c.l.op, '==');
  assert.equal(e.c.l.l.op, '<<');
  assert.equal(e.c.l.l.l.op, '+');
  assert.equal(e.c.l.l.l.r.op, '*');
  assert.equal(r.items[2].type.kind, 'array');
  assert.equal(r.items[2].type.of.kind, 'array');
  assert.equal(r.items[1].static, true);
});

test('parse: errors at their place, the parser going on after them', () => {
  const r = parse('int f(int x) {\n  int y = x +;\n  return y\n}\nint g() { return 1; }\nint h( { }', 't.c');
  assert.deepEqual(r.errors.map((e) => `${e.line}:${e.col} ${e.message}`), [
    "2:14 an expression expected, not ';'",
    "4:1 ';' expected after 'return', not '}'",
    "6:8 a type expected, not '{'",
  ]);
  assert.deepEqual(r.items.map((i) => i.name), ['f', 'g']);
});

test('constValue: C operators on constants and the constants known', () => {
  const v = (s, c) => constValue(parse(`int x = ${s};`).items[0].init, new Map(Object.entries(c || {}).map(([k, x]) => [k, BigInt(x)])));
  assert.equal(v('(1 << 4) - 1'), 15n);
  assert.equal(v('N * 2 + (N > 3 ? 1 : 0)', { N: 4 }), 9n);
  assert.equal(v('7 / 2 + 7 % 2 + ~0 + !5'), 3n);
  assert.equal(v('M + 1'), null);
  assert.equal(v('1 / 0'), null);
});

test('checkC: a valid source: the top function (the last one other than main, or #pragma HLS TOP), its loops and their trip counts, no message', () => {
  const r = checkC(`#include "ap_int.h"
#define N 4
int helper(int v) { return v * 2; }
void top(ap_uint<8> a, ap_uint<8> b, ap_uint<12> *sum) {
  int arr[N] = {1, 2, 3, 4};
  ap_uint<9> s = a + b;
  for (int i = 0; i < N; i++) s += arr[i];
  for (int j = 10; j >= 0; j -= 3) s ^= j;
  for (int k = 0; k <= 8; k += 2) s += helper(k);
  int m = 0;
  while (m < a) {
#pragma HLS LOOP_TRIPCOUNT max=255
    m++;
  }
  *sum = s + m;
}
int main() { ap_uint<12> r; top(1, 2, &r); printf("%d\\n", (int)r); return 0; }`, 't.c');
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.ok, true);
  assert.equal(r.top, 'top');
  assert.deepEqual(r.loops.map((l) => [l.fn, l.trip, l.max]), [['top', 4, 4], ['top', 4, 4], ['top', 5, 5], ['top', null, 255]]);
  // the TOP pragma chooses another function; main (the test bench) is never the top
  assert.equal(checkC('int a(int x) { return x; }\nint b(int y) { return y; }\n#pragma HLS TOP name=a\n').top, 'a');
  assert.equal(checkC('int a(int x) { return x; }\nint main() { return a(1); }').top, 'a');
  assert.deepEqual(msgs('int main() { return 0; }'), ['1:1 error: no function to synthesize: Silinx C makes the top function into a module (main() is the test bench)']);
});

test('checkC: what cannot be synthesized (UG1399): recursion, dynamic memory, system calls, pointers, floating point, structures, goto, unbounded loops, undefined behaviour', () => {
  assert.deepEqual(msgs('int f(int n) { return n ? f(n - 1) : 0; }'), ['1:5 error: recursion is not possible in hardware (Silinx C, as Vitis HLS): f → f']);
  assert.deepEqual(msgs('int g(int n);\nint f(int n) { return g(n); }\nint g(int n) { return f(n); }\nint top(int x) { return f(x); }'),
    ['2:5 error: recursion is not possible in hardware (Silinx C, as Vitis HLS): f → g → f']);
  assert.deepEqual(msgs(`#include <stdio.h>
int top(int *p, int n) {
  int *q = 0;
  float x = 1.5;
  int k = 0;
  while (k < n) k++;
  printf("%d", k);
  int *m = malloc(4);
  exit(1);
  struct pt { int a; } s;
  goto out;
out:
  return p[0] + *(p + 1) + n / 0 + (n << -1);
}`), [
    "3:8 error: 'q': a pointer variable is not possible in Silinx C (pointers only as arguments; use an array index)",
    "4:9 error: 'x': floating point (float) is not supported in Silinx C yet: use integers or ap_int<W>",
    '4:13 error: floating point (1.5) is not supported in Silinx C yet',
    "6:3 error: the number of iterations of this loop is not known: give its bound (a 'for' from a constant to a constant, its variable not changed in its body), or #pragma HLS LOOP_TRIPCOUNT max=N in it",
    '7:3 warning: printf is ignored by synthesis (it only prints in C simulation)',
    "8:8 error: 'm': a pointer variable is not possible in Silinx C (pointers only as arguments; use an array index)",
    '8:12 error: malloc: dynamic memory is not possible in hardware (Silinx C, as Vitis HLS: fixed sizes; use an array)',
    '9:3 error: exit is a system call: not possible in the synthesized code (Silinx C, as Vitis HLS)',
    "10:24 error: 's': structures (struct pt) are not supported in Silinx C yet",
    "11:3 error: 'goto' is not supported in Silinx C (use loops, 'break' and 'continue')",
    "12:1 error: labels are not supported in Silinx C ('out:')",
    '13:21 error: pointer arithmetic is not possible in Silinx C: index the array instead',
    '13:30 error: division by zero',
    '13:39 error: a shift by a negative amount (-1) is undefined in C',
  ]);
  // the test bench may do what the hardware cannot
  assert.deepEqual(msgs('int top(int x) { return x; }\nint main() { int *p = 0; float f = 1.0; while (1) { printf("x"); break; } return top(1); }'), []);
});

test('checkC: names, calls and types: undeclared, declared twice, arguments, ap_int widths, array sizes, returns, members', () => {
  assert.deepEqual(msgs(`#include "ap_int.h"
int other(int a, int b) { return a + b; }
int top(int x) {
  int y = 1;
  int y = 2;
  ap_uint<0> w0;
  ap_uint<2000> w1;
  int n = x;
  ap_int<n> w2;
  int arr[n];
  int z = other(x) + nope(x) + q;
  z = x.foo();
  return;
}
void v() { return 1; }`), [
    "5:7 error: 'y' is declared twice in the same block",
    '6:14 error: the width of ap_uint<0> must be from 1 to 1024',
    '7:17 error: the width of ap_uint<2000> must be from 1 to 1024',
    '9:13 error: the width of ap_int<…> must be a constant',
    '10:7 error: the size of an array must be a constant (Silinx C: fixed sizes)',
    "11:11 error: 'other' takes 2 argument(s), not 1",
    "11:22 error: the function 'nope' is not declared",
    "11:32 error: 'q' is not declared",
    "12:9 error: '.foo' is not a member function Silinx C knows (ap_int / ap_uint: range, to_int, to_uint, to_long, to_ulong, to_int64, to_uint64, length, and_reduce, or_reduce, xor_reduce)",
    "13:3 error: 'top' returns a value: 'return' needs one",
    "15:12 error: 'v' returns nothing (void): 'return' with no value",
  ]);
});

test('hints: the main messages of Silinx C have their help in English and in Portuguese', () => {
  for (const [msg, id] of [
    ['recursion is not possible in hardware (Silinx C, as Vitis HLS): f → f', 'c-recursion'],
    ['malloc: dynamic memory is not possible in hardware (Silinx C, as Vitis HLS: fixed sizes; use an array)', 'c-dynamic-memory'],
    ['exit is a system call: not possible in the synthesized code (Silinx C, as Vitis HLS)', 'c-system-call'],
    ["'q': a pointer variable is not possible in Silinx C (pointers only as arguments; use an array index)", 'c-pointer-variable'],
    ['pointer arithmetic is not possible in Silinx C: index the array instead', 'c-pointer-arithmetic'],
    ["'x': floating point (float) is not supported in Silinx C yet: use integers or ap_int<W>", 'c-float'],
    ["the number of iterations of this loop is not known: give its bound (a 'for' from a constant to a constant, its variable not changed in its body), or #pragma HLS LOOP_TRIPCOUNT max=N in it", 'c-loop-bound'],
    ["the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h)", 'c-header'],
    ['printf is ignored by synthesis (it only prints in C simulation)', 'c-printf'],
  ]) {
    const h = hintFor({ message: msg });
    assert.equal(h?.id, id, msg);
    for (const l of ['en', 'pt']) assert.ok(h[l].explain && h[l].fix && !/\$\d/.test(h[l].explain + h[l].fix), `${id} ${l}`);
  }
});
