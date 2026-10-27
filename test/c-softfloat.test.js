// Silinx HLS (#1762, core/c-softfloat.js): the binary32 soft-float library, run by Silinx's C simulation, against IEEE
// (JavaScript's Math.fround: a sum, a difference and a product of two floats computed in binary64 and rounded once are
// the correctly rounded binary32 ones), on the edge cases (zeros, subnormals, the largest and smallest, infinities,
// NaN, carries into the exponent, ties) and random values; the conversions as the C simulation converts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { SOFTFLOAT32, F32_NAN } from '../core/c-softfloat.js';
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
