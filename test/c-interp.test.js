// Silinx C, the C simulation (#1528): core/c-interp.js and core/c-interp-expr.js. Each program's main() is run by the
// interpreter and compiled with the host's cc (-fsigned-char -fwrapv): the same output, character by character, and
// the same exit code. Also: the calls of the top function recorded (what co-simulation replays), and the run
// stopped with its place on a division by zero, an index outside an array, an endless loop. ap_int / ap_uint:
// values worked out by hand from Vitis HLS's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simulateC } from '../core/c-interp.js';
import { CC, noCC } from './c-helpers.js';

/** The program's output and exit code, compiled with cc. */
function compiled(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ci-'));
  try {
    fs.writeFileSync(path.join(dir, 't.c'), src);
    execFileSync(CC, ['-std=c99', '-w', '-fsigned-char', '-fwrapv', '-O0', '-o', path.join(dir, 't'), path.join(dir, 't.c')]);
    try { return { output: execFileSync(path.join(dir, 't'), { encoding: 'utf8' }), exitCode: 0 }; }
    catch (e) { return { output: e.stdout, exitCode: e.status }; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function same(src, { exit = null } = {}) {
  const sim = simulateC(src, { file: 't.c' });
  assert.equal(sim.error, null, JSON.stringify(sim.error));
  const ref = compiled(src);
  assert.equal(sim.output, ref.output);
  assert.equal(sim.exitCode, ref.exitCode);
  if (exit !== null) assert.equal(sim.exitCode, exit);
  return sim;
}

test('C simulation against cc: printf\'s conversions, flags, widths and lengths; integer arithmetic, promotions and conversions', { skip: noCC }, () => {
  same(`#include <stdio.h>
#include <stdint.h>
int main(void) {
  int a = -1234; unsigned u = 4000000000u; char c = 'A'; short s = -7; long long ll = -9000000000LL;
  printf("%d|%5d|%-5d|%05d|%+d|% d|%i\\n", a, 42, 42, 42, 42, 42, a);
  printf("%u|%x|%X|%#x|%o|%#o|%08x\\n", u, u, 255, 255, 8, 8, 48879);
  printf("%c|%s|%.2s|%5s|%-5s|%%\\n", c, "text", "text", "ab", "ab");
  printf("%hd|%hhd|%hu|%hhu|%ld|%lld|%llu|%lx\\n", 70000, 300, 70000, 300, ll, ll, (unsigned long long)ll, 4096L);
  printf("%.5d|%8.3d|%-8.3d|\\n", 42, 42, -42);
  uint8_t b = 250; b += 10; int8_t sb = 127; sb++;
  printf("%d %d %d %d\\n", b, sb, (unsigned char)-1 > 0, -1 < 1u);
  printf("%d %d %d %d %d\\n", -7 / 2, -7 % 2, 7 / -2, 7 % -2, (-8) >> 1);
  printf("%u %d %d\\n", u + a, s * s, (int)(char)200);
  int x = 5; x <<= 3; x |= 1; x ^= 0xF0; x %= 77;
  printf("%d ", x); x++; printf("%d ", x); printf("%d\\n", ++x);
  return 3;
}
`, { exit: 3 });
});

test('C simulation against cc: control flow (if, switch with fall-through, loops with break / continue, do-while, ?:, && || skipping their right side), functions, pointers, arrays, statics and globals', { skip: noCC }, () => {
  same(`#include <stdio.h>
int count;
static int square(int v) { return v * v; }
static void bump(int *p, int by) { *p += by; count++; }
int sum(int a[], int n) { int s = 0; for (int i = 0; i < n; i++) s += a[i]; return s; }
int next_id(void) { static int id = 100; return id++; }
int main(void) {
  int t[6] = {5, -3, 8, 0, 2, 9};
  int k = 0;
  for (int i = 0; i < 6; i++) { if (t[i] == 0) continue; if (t[i] > 8) break; k += square(t[i]); }
  printf("k=%d sum=%d\\n", k, sum(t, 6));
  int v = 3;
  switch (v) { case 1: printf("one\\n"); case 3: printf("three\\n"); case 4: printf("four\\n"); break; default: printf("other\\n"); }
  int n = 0; do { n += 2; } while (n < 7);
  int z = 0;
  if (n > 100 && (z = 1)) printf("no\\n");
  if (n > 1 || (z = 2)) printf("yes z=%d\\n", z);
  bump(&n, 5); bump(&t[2], -8);
  int *p = &t[1]; p[1] = 77;
  printf("n=%d t2=%d count=%d %d %d %d\\n", n, t[2], count, next_id(), next_id(), n > 10 ? n : -n);
  int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
  m[1][0] += m[0][2] * 10;
  for (int r = 0; r < 2; r++) for (int q = 0; q < 3; q++) printf("%d ", m[r][q]);
  for (int i = 0, j = 10; i < j; i += 3, j--) printf("%d,%d ", i, j);
  printf("\\n");
  return 0;
}
`);
});

test('C simulation: the calls of the top function recorded (arguments, pointers before and after, the returned value); ap_int / ap_uint as Vitis HLS computes them; a bool takes 0 or 1', () => {
  const r = simulateC(`#include "ap_int.h"
#include <stdio.h>
int mac(ap_int<8> a, ap_int<8> b, int *acc, bool *big) {
  int p = a * b;
  *acc = *acc + p;
  *big = p;
  return p;
}
int main(void) {
  int acc = 10; bool big = 0;
  for (int i = 0; i < 3; i++) printf("%d ", mac(i * 50, -3, &acc, &big));
  ap_uint<8> x = 200, y = 100; ap_int<4> c = -3;
  printf("| %d %d %d %d %d %d %d\\n", (int)(x + y), (x - y).to_int(), (y - x).to_int(), (x * c).to_int(), (int)x.range(7, 4), (int)x[7], acc);
  return 0;
}`, { file: 'mac.c' });
  assert.equal(r.error, null);
  assert.equal(r.top, 'mac');
  // i * 50 as ap_int<8>: 0, 50, 100
  assert.equal(r.output, '0 -150 -300 | 300 100 -100 -600 12 1 -440\n');
  assert.deepEqual(r.calls.map((c) => [c.args.a, c.args.b, c.ptrIn.acc, c.ptrOut.acc, c.ptrOut.big, c.ret]),
    [[0n, -3n, 10n, 10n, 0n, 0n], [50n, -3n, 10n, -140n, 1n, -150n], [100n, -3n, -140n, -440n, 1n, -300n]]);
});

test('C simulation: the run stopped where it fails (division by zero, an index outside an array, an endless loop), the output up to there kept; a source with errors not run', () => {
  const err = (src, opts) => { const r = simulateC(src, { file: 't.c', ...opts }); return [r.ok, r.output, r.error && `${r.error.line}:${r.error.message}`]; };
  assert.deepEqual(err('#include <stdio.h>\nint f(int a) { return a; }\nint main(void) {\n  int z = 0;\n  printf("a");\n  return 1 / z;\n}'), [false, 'a', '6:division by zero']);
  assert.deepEqual(err('int f(int a) { return a; }\nint main(void) {\n  int t[3] = {0};\n  int i = 3;\n  return t[i];\n}'), [false, '', '5:the index 3 is outside the array (0 to 2)']);
  assert.deepEqual(err('int f(int a) { return a; }\nint main(void) {\n  int k = 0;\n  while (1) k++;\n  return k;\n}', { maxSteps: 1000 }), [false, '', '4:the C simulation stopped after 1,000 steps (an endless loop?)']);
  const bad = simulateC('int f(int n) { return n ? f(n - 1) : 0; }\nint main(void) { return f(3); }');
  assert.equal(bad.ok, false);
  assert.ok(bad.diagnostics.some((d) => /recursion/.test(d.message)));
  assert.deepEqual(err('int f(int a) { return a; }'), [false, '', '1:no main() to run: the C simulation runs the test bench, main()']);
});
