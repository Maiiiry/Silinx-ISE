// Silinx HLS (#1762, #1773, core/c-softfloat.js): the binary32 and binary64 soft-float libraries, run by Silinx's C simulation, against IEEE
// (JavaScript's Math.fround: a sum, a difference and a product of two floats computed in binary64 and rounded once are
// the correctly rounded binary32 ones), on the edge cases (zeros, subnormals, the largest and smallest, infinities,
// NaN, carries into the exponent, ties) and random values; the conversions as the C simulation converts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { SOFTFLOAT32, SOFTFLOAT64, F32_NAN, F64_NAN } from '../core/c-softfloat.js';
import { rng } from './c-helpers.js';

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const val = (b) => { u32[0] = b; return f32[0]; };
const bits = (x) => { if (Number.isNaN(x)) return F32_NAN; f32[0] = x; return u32[0]; };
const EDGE = [0, 0x80000000, 0x3f800000, 0xbf800000, 1, 0x80000001, 0x7fffff, 0x807fffff, 0x800000, 0x80800000, 0x7f7fffff, 0xff7fffff,
  0x7f800000, 0xff800000, 0x7fc00000, 0x7f800001, 0x3f800001, 0x3fffffff, 0x4b800000, 0x33800000, 0x00400000, 0x40490fdb, 0xc0490fdb, 0x4b000001, 0x34000000];

/** The library run on the pairs: each function's results, as the C simulation prints them. */
function run(pairs, fns) {
  const n = pairs.length;
  const arr = (k) => `static const unsigned ${k}[${n}] = {${pairs.map((p) => `${p[k === 'A' ? 0 : 1] >>> 0}u`).join(', ')}};`;
  const src = `#include <stdio.h>\n${SOFTFLOAT32}\n${arr('A')}\n${arr('B')}\nint top(int x) { return x; }\nint main(void) {\n  for (int i = 0; i < ${n}; i++) {\n    printf("${fns.map(() => '%u').join(' ')}\\n", ${fns.map((f) => f.c).join(', ')});\n  }\n  return 0;\n}\n`;
  const sim = simulateC(src, { file: 'sf.c', maxSteps: 400_000_000 });
  assert.deepEqual([sim.error, sim.diagnostics.filter((d) => d.severity === 'error')], [null, []]);
  return sim.output.trim().split('\n').map((l) => l.split(' ').map(Number));
}

const OPS = [
  { name: 'add', c: 'ap_f32_add(A[i], B[i])', ref: (a, b) => bits(Math.fround(val(a) + val(b))) },
  { name: 'sub', c: 'ap_f32_sub(A[i], B[i])', ref: (a, b) => bits(Math.fround(val(a) - val(b))) },
  { name: 'mul', c: 'ap_f32_mul(A[i], B[i])', ref: (a, b) => bits(Math.fround(val(a) * val(b))) },
  { name: 'div', c: 'ap_f32_div(A[i], B[i])', ref: (a, b) => bits(Math.fround(val(a) / val(b))) },
  { name: 'sqrt', c: 'ap_f32_sqrt(A[i])', ref: (a) => bits(Math.fround(Math.sqrt(val(a)))) },
  { name: 'eq', c: 'ap_f32_eq(A[i], B[i])', ref: (a, b) => +(val(a) === val(b)) },
  { name: 'lt', c: 'ap_f32_lt(A[i], B[i])', ref: (a, b) => +(val(a) < val(b)) },
  { name: 'le', c: 'ap_f32_le(A[i], B[i])', ref: (a, b) => +(val(a) <= val(b)) },
  { name: 'unord', c: 'ap_f32_unord(A[i], B[i])', ref: (a, b) => +(Number.isNaN(val(a)) || Number.isNaN(val(b))) },
];
const check = (pairs, ops) => {
  const got = run(pairs, ops);
  const bad = [];
  pairs.forEach(([a, b], i) => ops.forEach((op, k) => {
    const e = op.ref(a, b) >>> 0;
    if (got[i][k] !== e) bad.push(`${op.name}(${a.toString(16)}, ${b.toString(16)}) = ${got[i][k].toString(16)}, not ${e.toString(16)}`);
  }));
  assert.deepEqual(bad.slice(0, 10), []);
};

test('#1762 binary32 add, sub, mul and the comparisons: every pair of the edge cases, as IEEE', () => {
  check(EDGE.flatMap((a) => EDGE.map((b) => [a, b])), OPS);
});

test('#1762 binary32 add, sub, mul and the comparisons: random values, near exponents and any, as IEEE', () => {
  const r = rng(1762);
  const pairs = [];
  for (let i = 0; i < 2000; i++) {
    const a = r() >>> 0;
    // (half of them near a's exponent: cancellations and carries)
    const b = i % 2 ? (r() >>> 0) : ((a & 0xff800000) + ((r() % 5) - 2) * 0x800000 + (r() & 0x7fffff)) >>> 0;
    pairs.push([a, b]);
  }
  // (products near the subnormals and the largest: exponents summing near 127 ± 150)
  for (let i = 0; i < 600; i++) {
    const ea = 1 + (r() % 120), eb = Math.max(0, Math.min(254, 127 - ea + ((r() % 60) - 30) + (i % 2 ? 0 : 127)));
    pairs.push([((r() & 1) << 31 | ea << 23 | (r() & 0x7fffff)) >>> 0, ((r() & 1) << 31 | eb << 23 | (r() & 0x7fffff)) >>> 0]);
  }
  check(pairs, OPS);
});

test('#1762 binary32 conversions: int and unsigned to float (rounded to nearest even), float to int and unsigned (truncated; out of range as the C simulation)', () => {
  const r = rng(17621);
  const ints = [0, 1, -1, 16777216, 16777217, 16777219, -16777217, 2147483647, -2147483648, 0x7fffff80, 0xffffffff, 33554431, ...Array.from({ length: 60 }, () => r() | 0)];
  const flts = [...EDGE, 0x4effffff, 0x4f000000, 0xcf000000, 0x4f800000, 0x5f000000, 0x3f7fffff, 0xbfc00000, 0x40400000, ...Array.from({ length: 60 }, () => r() >>> 0)];
  const wrap = (x) => (Number.isFinite(x) ? Number(BigInt.asUintN(32, BigInt(Math.trunc(x)))) : 0);
  check(ints.map((x) => [x >>> 0, 0]), [
    { name: 'from_i32', c: 'ap_f32_from_i32((int)A[i])', ref: (a) => bits(Math.fround(a | 0)) },
    { name: 'from_u32', c: 'ap_f32_from_u32(A[i])', ref: (a) => bits(Math.fround(a >>> 0)) },
  ]);
  check(flts.map((x) => [x >>> 0, 0]), [
    { name: 'to_u32', c: 'ap_f32_to_u32(A[i])', ref: (a) => wrap(val(a)) },
    { name: 'to_i32', c: '(unsigned)ap_f32_to_i32(A[i])', ref: (a) => wrap(val(a)) },
  ]);
});

test('#1762 the library synthesized: a module of its operations, co-simulated in VHDL and Verilog on the edge cases, no warning', () => {
  const src = `${SOFTFLOAT32}
unsigned top(unsigned a, unsigned b, int op) {
  if (op == 0) return ap_f32_add(a, b);
  if (op == 1) return ap_f32_sub(a, b);
  if (op == 2) return ap_f32_mul(a, b);
  if (op == 3) return (unsigned)ap_f32_le(a, b);
  if (op == 4) return ap_f32_from_i32((int)a);
  return ap_f32_to_u32(a);
}
int main(void) {
  unsigned v[8] = {0x3f800000u, 0x40490fdbu, 0x1u, 0x7f7fffffu, 0x80000000u, 0xc0000000u, 0x7fc00000u, 0x00800000u};
  unsigned s = 0;
  for (int i = 0; i < 8; i++) for (int j = 0; j < 8; j++) for (int op = 0; op < 6; op++) s += top(v[i], v[j], op);
  return s == 0;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'sf.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 384, []], JSON.stringify(r.mismatches.slice(0, 3), (k, v) => (typeof v === 'bigint' ? `${v}` : v)));
  }
});

// ------------------------------------------------------------------ binary64 (#1773): JavaScript's numbers are binary64
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
const val64 = (b) => { u64[0] = b; return f64[0]; };
const bits64 = (x) => { if (Number.isNaN(x)) return F64_NAN; f64[0] = x; return u64[0]; };
const EDGE64 = [0n, 1n << 63n, 0x3ff0000000000000n, 0xbff0000000000000n, 1n, 0x8000000000000001n, 0xfffffffffffffn, 0x10000000000000n, 0x7fefffffffffffffn,
  0xffefffffffffffffn, 0x7ff0000000000000n, 0xfff0000000000000n, 0x7ff8000000000000n, 0x7ff0000000000001n, 0x3ff0000000000001n, 0x3fffffffffffffffn,
  0x4340000000000000n, 0x3ca0000000000000n, 0x400921fb54442d18n, 0x3fb999999999999an, 0x0008000000000000n, 0x4330000000000001n];
function run64(pairs, fns, lib = SOFTFLOAT64) {
  const n = pairs.length;
  const arr = (k, i) => `static const unsigned long long ${k}[${n}] = {${pairs.map((p) => `${BigInt.asUintN(64, BigInt(p[i]))}ull`).join(', ')}};`;
  const src = `#include <stdio.h>\n${SOFTFLOAT32}\n${lib}\n${arr('A', 0)}\n${arr('B', 1)}\nint top(int x) { return x; }\nint main(void) {\n  for (int i = 0; i < ${n}; i++) {\n    printf("${fns.map(() => '%llu').join(' ')}\\n", ${fns.map((f) => `(unsigned long long)(${f.c})`).join(', ')});\n  }\n  return 0;\n}\n`;
  const sim = simulateC(src, { file: 'sf.c', maxSteps: 400_000_000 });
  assert.deepEqual([sim.error, sim.diagnostics.filter((d) => d.severity === 'error')], [null, []]);
  return sim.output.trim().split('\n').map((l) => l.split(' ').map(BigInt));
}
const check64 = (pairs, ops) => {
  const got = run64(pairs, ops);
  const bad = [];
  pairs.forEach(([a, b], i) => ops.forEach((op, k) => {
    const e = BigInt.asUintN(64, BigInt(op.ref(a, b)));
    if (got[i][k] !== e) bad.push(`${op.name}(${a.toString(16)}, ${b.toString(16)}) = ${got[i][k].toString(16)}, not ${e.toString(16)}`);
  }));
  assert.deepEqual(bad.slice(0, 10), []);
};
const OPS64 = [
  { name: 'add', c: 'ap_f64_add(A[i], B[i])', ref: (a, b) => bits64(val64(a) + val64(b)) },
  { name: 'sub', c: 'ap_f64_sub(A[i], B[i])', ref: (a, b) => bits64(val64(a) - val64(b)) },
  { name: 'mul', c: 'ap_f64_mul(A[i], B[i])', ref: (a, b) => bits64(val64(a) * val64(b)) },
  { name: 'div', c: 'ap_f64_div(A[i], B[i])', ref: (a, b) => bits64(val64(a) / val64(b)) },
  { name: 'sqrt', c: 'ap_f64_sqrt(A[i])', ref: (a) => bits64(Math.sqrt(val64(a))) },
  { name: 'eq', c: 'ap_f64_eq(A[i], B[i])', ref: (a, b) => +(val64(a) === val64(b)) },
  { name: 'lt', c: 'ap_f64_lt(A[i], B[i])', ref: (a, b) => +(val64(a) < val64(b)) },
  { name: 'le', c: 'ap_f64_le(A[i], B[i])', ref: (a, b) => +(val64(a) <= val64(b)) },
];

test('#1773 binary64 add, sub, mul and the comparisons: every pair of the edge cases and random values, as IEEE', () => {
  const r = rng(1773);
  const rnd = () => (BigInt(r() >>> 0) << 32n) | BigInt(r() >>> 0);
  const pairs = EDGE64.flatMap((a) => EDGE64.map((b) => [a, b]));
  for (let i = 0; i < 800; i++) {
    const a = rnd();
    const b = i % 2 ? rnd() : BigInt.asUintN(64, (a & 0xfff0000000000000n) + BigInt((r() % 5) - 2) * 0x10000000000000n + (rnd() & 0xfffffffffffffn));
    pairs.push([a, b]);
  }
  for (let i = 0; i < 300; i++) {
    const ea = 1 + (r() % 1000), eb = Math.max(0, Math.min(2046, 1023 - ea + ((r() % 120) - 60) + (i % 2 ? 0 : 1023)));
    pairs.push([BigInt(r() & 1) << 63n | BigInt(ea) << 52n | (rnd() & 0xfffffffffffffn), BigInt(r() & 1) << 63n | BigInt(eb) << 52n | (rnd() & 0xfffffffffffffn)]);
  }
  check64(pairs, OPS64);
});

test('#1773 binary64 conversions: int and unsigned to double (exact), double to int and unsigned (truncated, as the C simulation), float to double and double to float (rounded to nearest even)', () => {
  const r = rng(17731);
  const wrap = (x) => (Number.isFinite(x) ? BigInt.asUintN(32, BigInt(Math.trunc(x))) : 0n);
  const ints = [0, 1, -1, 2147483647, -2147483648, 0xffffffff, ...Array.from({ length: 40 }, () => r() | 0)];
  check64(ints.map((x) => [BigInt(x >>> 0), 0n]), [
    { name: 'from_i32', c: 'ap_f64_from_i32((int)A[i])', ref: (a) => bits64(Number(a) | 0) },
    { name: 'from_u32', c: 'ap_f64_from_u32((unsigned)A[i])', ref: (a) => bits64(Number(a) >>> 0) },
  ]);
  const dbl = [...EDGE64, 0x41dfffffffc00000n, 0x41e0000000000000n, 0xc1e0000000000000n, 0x41f0000000000000n, 0x4430000000000000n, 0x36a0000000000000n, 0x380fffffffffffffn,
    0x47efffffefffffffn, 0x47effffff0000000n, 0x3810000000000001n, ...Array.from({ length: 60 }, () => (BigInt(r() >>> 0) << 32n) | BigInt(r() >>> 0))];
  check64(dbl.map((x) => [x, 0n]), [
    { name: 'to_u32', c: 'ap_f64_to_u32(A[i])', ref: (a) => wrap(val64(a)) },
    { name: 'to_i32', c: '(unsigned)ap_f64_to_i32(A[i])', ref: (a) => wrap(val64(a)) },
    { name: 'to_f32', c: 'ap_f32_from_f64(A[i])', ref: (a) => bits(Math.fround(val64(a))) },
  ]);
  const flts = [...EDGE, ...Array.from({ length: 60 }, () => r() >>> 0)];
  check64(flts.map((x) => [BigInt(x >>> 0), 0n]), [{ name: 'from_f32', c: 'ap_f64_from_f32((unsigned)A[i])', ref: (a) => bits64(val(Number(a))) }]);
});
