// Silinx HLS (#1768, core/c-dataflow-float.js): float in synthesized functions, each operation a call of the soft-float
// library (core/c-softfloat.js) on the values' bits: variables, a float array (ap_memory of 32 bits), a pointer output,
// a result, + - *, the comparisons, ?:, -x, !x, casts to and from int, a double constant converted to a float. The C
// simulation as cc's; the co-simulation in VHDL and Verilog (the C simulation's floats as their bits), a sequential and
// a combinational module, on the edge values (infinities, NaN, subnormals, -0); what is not made yet, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const MAC = `#include <stdio.h>
float mac(float a[8], float b, int k, float *out) {
  float s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (a[i] > b && !(a[i] == 3.0f)) s = s + a[i] * b;
    else s = s - 1.5f;
  }
  *out = -s + (float)k;
  return s < 0.0f ? (float)(int)(s * 0.001f) : s * 0.25f;   /* (an int out of range: C leaves it undefined) */
}
int main(void) {
  float a[8] = {1.5f, -2.25f, 3.0f, 0.1f, 1e10f, -7.75f, 2.5e-30f, 100.0f};
  float o;
  for (int c = 0; c < 4; c++) { float r = mac(a, c * 0.75f - 1.0f, c * 3 - 2, &o); printf("%.9g %.9g\\n", (double)r, (double)o); }
  return 0;
}
`;

test('#1768 float in a sequential module: the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(MAC, { file: 'mac.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, compiledRun(MAC).output);
});

test('#1768 float in a sequential module co-simulated in VHDL and Verilog: a float array an ap_memory of 32 bits, the argument, the pointer output and the result 32-bit ports (their IEEE bits)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(MAC, { file: 'mac.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.sequential], [[], true, 4, true], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.message}`), ["2 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"]);
    assert.deepEqual(r.gen.ports.filter((p) => !/^ap_(clk|rst|start|done|idle|ready)$/.test(p.name)).map((p) => `${p.name}:${p.w}`),
      ['a_address0:3', 'a_ce0:1', 'a_q0:32', 'b:32', 'k:32', 'out_r:32', 'out_r_ap_vld:1', 'ap_return:32']);
  }
});

test('#1768 float in a combinational module: + - * and the comparisons on the edge values (infinities, NaN, subnormals, -0, the largest), co-simulated in VHDL and Verilog', () => {
  const src = `float f(float a, float b, int *c) {
  *c = (a < b) + 2 * (a <= b) + 4 * (a == b) + 8 * (a != b) + 16 * !a;
  return a * b - (a + b) * 0.5f;
}
int main(void) {
  float v[10] = {0.0f, -0.0f, 1.0f, -3.5f, 1e-45f, 3.4e38f, -3.4e38f, 1.0f / 0.0f, 0.0f / 0.0f, 6.1e-39f};
  int c, s = 0;
  for (int i = 0; i < 10; i++) for (int j = 0; j < 10; j++) { float r = f(v[i], v[j], &c); s += c + (r > 0.0f); }
  return s == 0;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'f.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.sequential, r.gen.diagnostics], [[], true, 100, false, []], JSON.stringify(r.mismatches.slice(0, 3), big));
  }
});

test('#1768 float: what is not made yet, said (double, a double constant in an operation, a division)', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('double f(double x) { return x; }\n'), ["1 the result of 'f': double is not supported in Silinx HLS yet: use float (#1761)", "1 the parameter 'x': double is not supported in Silinx HLS yet: use float (#1761)"]);
  assert.deepEqual(errs('float f(float x) { return x * 0.1; }\n'), ['1 the double constant 0.1: double arithmetic is not made in hardware yet: write 0.1f (a float) (#1761)']);
  assert.deepEqual(errs('float f(float x, float y) { return x / y; }\n'), ['1 a float division is not made in hardware yet (#1761)']);
  // (a double constant a float's value; one a float holds exactly in a comparison)
  assert.deepEqual(errs('float f(float x) { float y = 0.1; return x < 0.5 ? y : x; }\n'), []);
});
