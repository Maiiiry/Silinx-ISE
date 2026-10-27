// Silinx C, C/RTL co-simulation (#1528): core/c-cosim.js. The test bench's calls of the top function replayed on the
// generated VHDL and Verilog (a combinational module, a sequential one through ap_ctrl_hs) and compared with the C's
// results: a pass with its latency; an HDL that differs reported call by call and port by port; a test bench that does
// not call the top, or a C simulation that fails, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';

const ADDER = `#include "ap_int.h"
#include <stdio.h>
void adder4(ap_uint<4> a, ap_uint<4> b, ap_uint<5> *sum, bool *carry) {
  ap_uint<5> s = a + b;
  *sum = s;
  *carry = s[4];
}
int main(void) {
  ap_uint<5> sum; bool carry;
  for (int a = 0; a < 16; a += 3) for (int b = 0; b < 16; b += 5) { adder4(a, b, &sum, &carry); printf("%d+%d=%d\\n", a, b, (int)sum); }
  return 0;
}
`;
const GCD = `#include <stdio.h>
unsigned gcd(unsigned a, unsigned b, unsigned *steps) {
  unsigned n = 0;
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    if (a >= b) { a = a - b; } else { b = a; a = t; }
    if (a < b) { t = a; a = b; b = t; }
    n++;
  }
  *steps = n;
  return a;
}
int main(void) {
  unsigned st;
  unsigned t[5][2] = {{48, 18}, {17, 5}, {100, 75}, {7, 0}, {1000, 3}};
  for (int k = 0; k < 5; k++) printf("gcd %u\\n", gcd(t[k][0], t[k][1], &st));
  return 0;
}
`;

test('#1528 co-simulation: a combinational module (ap_ctrl_hs), its calls replayed in VHDL and Verilog: a pass', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(ADDER, { file: 'adder4.c', lang });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual([r.ok, r.pass, r.calls, r.mismatches, r.latency], [true, true, 24, [], null], lang);
    assert.match(r.output, /^0\+0=0\n0\+5=5\n/);
  }
});

test('#1528 co-simulation: a sequential module through ap_ctrl_hs: a pass, its latency (cycles per call)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(GCD, { file: 'gcd.c', lang });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual([r.ok, r.pass, r.calls, r.mismatches], [true, true, 5, []], lang);
    assert.ok(r.latency.min > 0 && r.latency.max > r.latency.min, JSON.stringify(r.latency));
  }
});

test('#1528 co-simulation: an HDL that differs from the C: each mismatch with its call and port; no call of the top, a C simulation that fails: said', () => {
  const r = cosimulate(ADDER, { file: 'adder4.c', lang: 'verilog', alter: (h) => h.replace(/assign (ap_t\d+) = (ap_t\d+) \+ (ap_t\d+);/, 'assign $1 = $2 - $3;') });
  assert.equal(r.pass, false);
  assert.ok(r.mismatches.length > 0);
  assert.deepEqual(Object.keys(r.mismatches[0]), ['call', 'port', 'expected', 'got']);
  assert.ok(r.mismatches.every((m) => ['sum', 'carry'].includes(m.port)), JSON.stringify(r.mismatches.slice(0, 3), (_, x) => (typeof x === 'bigint' ? String(x) : x)));
  const none = cosimulate('int f(int a) { return a; }\nint main(void) { return 0; }');
  assert.deepEqual([none.ok, none.pass, none.errors], [true, false, ["the test bench (main) does not call the top function 'f': nothing to compare"]]);
  const fails = cosimulate('int f(int a) { return a; }\nint main(void) { int z = 0; return f(1) / z; }');
  assert.deepEqual([fails.ok, fails.errors], [false, ['the C simulation failed: line 2: division by zero']]);
});
