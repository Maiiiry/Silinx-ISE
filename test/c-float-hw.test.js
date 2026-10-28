// Silinx HLS (#1768, #1773, core/c-dataflow-float.js): float and double in synthesized functions, each operation a call of the soft-float
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

const POLY = `#include <stdio.h>
double poly(double c[4], float x, int n, double *err) {
  double s = 0.0;
  for (int i = 0; i < 4; i++) s = s * x + c[i];
  float f = s * 0.5;
  *err = s - (double)f + n * 1e-3;
  return s > 1e6 ? (double)(int)(s * 1e-3) : -s + 0.1;
}
int main(void) {
  double c[4] = {1.5, -2.25, 3.0e-5, 0.1};
  double e;
  for (int k = 0; k < 4; k++) { double r = poly(c, k * 1.25f - 2.0f, k, &e); printf("%.17g %.17g\\n", r, e); }
  return 0;
}
`;

test('#1773 double in a sequential module (C\'s conversions: float with double a double, a double constant a double, double to float rounded): the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(POLY, { file: 'poly.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, compiledRun(POLY).output);
});

test('#1773 double co-simulated in VHDL and Verilog: a double array an ap_memory of 64 bits, the pointer output and the result 64-bit ports, a float argument 32', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(POLY, { file: 'poly.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 4, []], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.ports.filter((p) => !/^ap_(clk|rst|start|done|idle|ready)$/.test(p.name)).map((p) => `${p.name}:${p.w}`),
      ['c_address0:2', 'c_ce0:1', 'c_q0:64', 'x:32', 'n:32', 'err:64', 'err_ap_vld:1', 'ap_return:64']);
  }
});

test('#1773 double in a combinational module: + - * and the comparisons on the edge values, co-simulated in VHDL and Verilog', () => {
  const src = `double f(double a, double b, int *c) {
  *c = (a < b) + 2 * (a <= b) + 4 * (a == b) + 8 * (a != b) + 16 * !a;
  return a * b - (a + b) * 0.1;
}
int main(void) {
  double v[8] = {0.0, -0.0, 1.0, -3.5, 4.9e-324, 1.7e308, 1.0 / 0.0, 0.0 / 0.0};
  int c, s = 0;
  for (int i = 0; i < 8; i++) for (int j = 0; j < 8; j++) { double r = f(v[i], v[j], &c); s += c + (r > 0.0); }
  return s == 0;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'f.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 64, []], JSON.stringify(r.mismatches.slice(0, 3), big));
  }
});

test('#1773 floating point: what is not made yet, said (a division); a double constant with a float a double operation', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('float f(float x, float y) { return x / y; }\n'), ['1 a float division is not made in hardware yet (#1761)']);
  assert.deepEqual(errs('double f(double x, int k) { return x / k; }\n'), ['1 a double division is not made in hardware yet (#1761)']);
  assert.deepEqual(errs('float f(float x) { float y = 0.1; return x < 0.5 ? y : x * 0.1; }\ndouble g(double d) { return d; }\n'), []);
});
