// Silinx HLS C++ (#1743, core/cpp-np-channel.js): hls_np_channel.h's hls::split and hls::merge in a DATAFLOW region:
// streams and a task of their own moving each value, a split's to its outputs in turn, a merge's from its inputs in
// turn; load_balance made as round_robin (said). The C simulation; the co-simulation in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = (mode) => `#include "hls_np_channel.h"
#include "hls_stream.h"
#include <stdio.h>
void producer(hls::stream<int>& out, hls::stream<int>& in) { for (int i = 0; i < 8; i++) out.write(in.read() * 3); }
void consumer(hls::stream<int>& in, hls::stream<int>& out) { for (int i = 0; i < 4; i++) out.write(in.read() + 1); }
void pass2(hls::stream<int>& in, hls::stream<int>& out) { for (int i = 0; i < 4; i++) out.write(in.read()); }
void gather(hls::stream<int>& in, hls::stream<int>& out) { for (int i = 0; i < 8; i++) out.write(in.read() - 100); }
void dut(hls::stream<int>& in, hls::stream<int>& out) {
#pragma HLS dataflow
  hls::split::${mode}<int, 2, 4> s;
  hls::merge::${mode}<int, 2> m;
  producer(s.in, in);
  consumer(s.out[0], m.in[0]);
  pass2(s.out[1], m.in[1]);
  gather(m.out, out);
}
int main() {
  hls::stream<int> a, b;
  for (int i = 0; i < 8; i++) a.write(i + 10);
  dut(a, b);
  for (int i = 0; i < 8; i++) printf("%d ", b.read());
  printf("\\n");
  return 0;
}
`;

test('#1743 hls::split and hls::merge round_robin: each value to its outputs in turn and back from its inputs in turn; co-simulated in VHDL and Verilog', () => {
  // (in: 10..17, x3; split: 30 to consumer (+1), 33 to pass2, …; merge: consumer's, pass2's, …; -100)
  assert.equal(simulateC(SRC('round_robin'), { file: 'd.cpp' }).output, '-69 -67 -63 -61 -57 -55 -51 -49 \n');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC('round_robin'), { file: 'd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.report.processes.map((p) => `${p.instance}${p.task ? ` (task ${p.task})` : ''}`),
      ['ap_split_s_U0 (task s)', 'ap_merge_m_U1 (task m)', 'producer_U2', 'consumer_U3', 'pass2_U4', 'gather_U5']);
    assert.deepEqual(r.gen.report.fifos.map((f) => `${f.name}:${f.depth}`), ['s_in:2', 's_out_0:4', 's_out_1:4', 'm_in_0:2', 'm_in_1:2', 'm_out:2']);
  }
});

test('#1743 load_balance: made as round_robin, said', () => {
  const r = cosimulate(SRC('load_balance'), { file: 'd.cpp', lang: 'verilog' });
  assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
  assert.equal(r.output, '-69 -67 -63 -61 -57 -55 -51 -49 \n');
  assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
    "10 warning: hls::split::load_balance 's': made as round_robin (each output in turn)",
    "11 warning: hls::merge::load_balance 'm': made as round_robin (each input in turn)"]);
});
