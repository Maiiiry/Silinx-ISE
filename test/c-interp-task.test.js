// Silinx HLS (#1721, core/c-interp-task.js): hls::task in the C simulation, as Vitis HLS's threads run them. A task
// started once (hls_thread_local) runs its function again and again while its inputs have values, whenever the test
// bench or the top would wait; an invocation that would read an empty stream is undone and tried again later; a
// function `init; while (1) body` keeps its init's variables across iterations and across the top's calls. Its
// hardware (#1719): test/c-processes.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';

const run = (src) => { const r = simulateC(src, { file: 't.cpp' }); assert.deepEqual([r.error, r.diagnostics.filter((d) => d.severity === 'error')], [null, []]); return r; };

test('#1721 data-driven tasks (AMD\'s simple_data_driven): a splitter and two tasks after it; the top returns, the test bench reads what they wrote; each call recorded with what its tasks read and wrote', () => {
  const src = `#include "hls_task.h"
#include <stdio.h>
#define N 10
void splitter(hls::stream<int>& in, hls::stream<int>& odds_buf, hls::stream<int>& evens_buf) {
  int data = in.read();
  if (data % 2 == 0) evens_buf.write(data); else odds_buf.write(data);
}
void odds(hls::stream<int>& in, hls::stream<int>& out) { out.write(in.read() + 1); }
void evens(hls::stream<int>& in, hls::stream<int>& out) { out.write(in.read() + 2); }
void odds_and_evens(hls::stream<int>& in, hls::stream<int>& out1, hls::stream<int>& out2);
void odds_and_evens(hls::stream<int>& in, hls::stream<int>& out1, hls::stream<int>& out2) {
  hls_thread_local hls::stream<int, N / 2> s1;
  hls_thread_local hls::stream<int, N / 2> s2;
  hls_thread_local hls::task t1(splitter, in, s1, s2);
  hls_thread_local hls::task t2(odds, s1, out1);
  hls_thread_local hls::task t3(evens, s2, out2);
}
int main() {
  hls::stream<int, N> in; hls::stream<int, N / 2> out1, out2;
  for (int i = 0; i < N; i++) in.write(i);
  odds_and_evens(in, out1, out2);
  for (int i = 0; i < N / 2; i++) printf("%d ", out1.read());
  for (int i = 0; i < N / 2; i++) printf("%d ", out2.read());
  return 0;
}
`;
  const r = run(src);
  assert.equal(r.output, '2 4 6 8 10 2 4 6 8 10 ');
  assert.deepEqual(r.calls.map((c) => [c.streamRead.in, c.streamOut.out1, c.streamOut.out2]), [[10, [2n, 4n, 6n, 8n, 10n], [2n, 4n, 6n, 8n, 10n]]]);
});

test('#1721 a task `init; while (1) body`: its init\'s variables kept across its iterations and the top\'s calls; an invocation that reads two values with one there undone, run again when the second comes', () => {
  const src = `#include "hls_task.h"
#include <stdio.h>
void count(hls::stream<int>& in, hls::stream<int>& out) {
  int cnt = 100;
  while (1) {
    int t = in.read();
    out.write(t + cnt++);
  }
}
void pairs(hls::stream<int>& in, hls::stream<int>& out) {
  int a = in.read();
  printf("[%d]", a);
  out.write(a * 10 + in.read());
}
void top(hls::stream<int>& in, hls::stream<int>& out) {
  hls_thread_local hls::stream<int> mid;
  hls_thread_local hls::task t1(pairs, in, mid);
  hls_thread_local hls::task t2(count, mid, out);
}
int main() {
  hls::stream<int> in, out;
  in.write(1); in.write(2); in.write(3);
  top(in, out);
  printf(" %d |", out.read());
  in.write(4); in.write(5); in.write(6);
  top(in, out);
  while (!out.empty()) printf(" %d", out.read());
  printf("\\n");
  return 0;
}
`;
  const r = run(src);
  // (pairs: 1,2 -> 12; 3 waits for 4; then 34, 56; count adds 100, 101, 102; pairs' printf undone with it)
  assert.equal(r.output, '[1] 112 |[3][5] 135 158\n');
  assert.deepEqual(r.calls.map((c) => [c.streamRead.in, c.streamOut.out]), [[2, [112n]], [4, [135n, 158n]]]);
});

test('#1721 a task that never reads nor writes (waiting on a condition) stops, run again when its input comes', () => {
  const src = '#include "hls_task.h"\nvoid idle(hls::stream<int>& in, hls::stream<int>& out) { if (!in.empty()) out.write(in.read()); }\nvoid top(hls::stream<int>& in, hls::stream<int>& out) {\n  hls_thread_local hls::task t(idle, in, out);\n}\nint main() { hls::stream<int> a, b; top(a, b); a.write(7); top(a, b); return b.read() == 7 ? 0 : 1; }\n';
  assert.equal(run(src).exitCode, 0);
});
