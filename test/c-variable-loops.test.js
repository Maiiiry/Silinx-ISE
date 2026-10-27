// Silinx HLS: a loop of unknown count (#1699) made as Vitis HLS makes it, a state machine running until its condition
// is false, its latency unknown (a warning; LOOP_TRIPCOUNT only the report's bound); a constant of a header two sources
// include declared again, the same constant (#1700). The C simulation as cc's; the co-simulation in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = `#include <stdio.h>
int loop_var(int A[16], unsigned char width, int stop) {
  int acc = 0;
  for (int x = 0; x < width; x++) acc += A[x & 15] * (x + 1);
  int n = 0;
  while (acc > stop) {
    acc -= stop + 3;
    n++;
  }
  return acc * 100 + n;
}
int main(void) {
  int A[16];
  for (int i = 0; i < 16; i++) A[i] = 3 * i - 7;
  for (int w = 0; w < 40; w += 7) printf("%d\\n", loop_var(A, w, 50 + w));
  return 0;
}
`;

test('#1699 loops of unknown count in the C simulation: as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SRC, { file: 'loop_var.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, compiledRun(SRC).output);
});

test('#1699 loops of unknown count made, co-simulated in VHDL and Verilog: each said (its latency unknown), the report\'s cycles unknown; LOOP_TRIPCOUNT the report\'s bound', () => {
  const W = 'the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'loop_var.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.equal(r.gen.sequential, true);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [`4 warning: ${W}`, `6 warning: ${W}`]);
    assert.deepEqual(r.gen.report.loops.map((l) => [l.line, l.trip, l.max, l.cycles]), [[4, null, null, null], [6, null, null, null]]);
  }
  const bounded = cToHdl('int f(int n) {\n  int s = 0;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n    s += i;\n  }\n  return s;\n}\n', { file: 'b.c' });
  assert.deepEqual([bounded.ok, bounded.diagnostics, bounded.report.loops.map((l) => l.max)], [true, [], [8]]);
});

test('#1700 a constant of a header two sources include: the same constant, accepted; another value or a variable declared twice, said', () => {
  const headers = { 'ex.h': 'const int NUM = 10;\nint top(int a);\n', 'top.cpp': '#include "ex.h"\nint top(int a) { return a * NUM; }\n', 'tb.cpp': '#include "ex.h"\nint main() { return top(3) == 30 ? 0 : 1; }\n' };
  const unit = '#include "top.cpp"\n#include "tb.cpp"\n';
  const sim = simulateC(unit, { file: 'unit.cpp', headers, top: 'top' });
  assert.deepEqual([sim.error, sim.diagnostics.filter((d) => d.severity === 'error'), sim.exitCode], [null, [], 0]);
  assert.deepEqual(cToHdl(unit, { file: 'unit.cpp', headers, top: 'top' }).diagnostics, []);
  const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('const int N = 4;\nconst int N = 5;\nint f(int a) { return a + N; }\n'), ["2 'N' is declared twice"]);
  assert.deepEqual(errs('int g = 4;\nint g = 4;\nint f(int a) { return a + g; }\n'), ["2 'g' is declared twice"]);
});
