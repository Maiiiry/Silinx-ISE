// Silinx HLS (#1628, core/c-aggregate.js): a struct argument or result of the top function one port, as Vitis HLS
// aggregates it (UG1399, the Vivado IP flow): its members in their order from the LSB, each its C size (bool and char 8
// bits, an ap_int<W> a power of 2 of bytes), the padding 0; read only an input, written <name>_i / _o / _o_ap_vld,
// returned ap_return. Co-simulated in VHDL and Verilog, a combinational module's and a sequential one's; an HDL whose
// fields differ found; the names of VHDL or Verilog said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate, pack } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { cBits, layout } from '../core/c-aggregate.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const ports = (r) => r.gen.ports.filter((p) => !/^ap_(clk|rst|start|done|idle|ready)$/.test(p.name)).map((p) => `${p.name}:${p.w}`);

test('#1628 the C size of a member and the layout of a struct\'s port', () => {
  assert.deepEqual([1, 5, 8, 9, 12, 16, 17, 32, 33, 64, 65].map(cBits), [8, 8, 8, 16, 16, 16, 32, 32, 64, 64, 128]);
  const int = (bits) => ({ kind: 'int', bits });
  const params = [{ name: 's_a', type: int(16) }, { name: 's_b', type: { kind: 'ptr', to: int(1) } }, { name: 's_c', type: int(5) }, { name: 's_d', type: int(64) }];
  assert.deepEqual(layout(['s_a', 's_b', 's_c', 's_d'], params), { w: 96, fields: [
    { param: 's_a', off: 0, w: 16, size: 16 }, { param: 's_b', off: 16, w: 1, size: 8 }, { param: 's_c', off: 24, w: 5, size: 8 }, { param: 's_d', off: 32, w: 64, size: 64 }] });
  // (the value of a port: each member's bits at its field, a negative one's too, the padding 0)
  const f = layout(['s_a', 's_b', 's_c'], params).fields;
  assert.equal(pack(f, (m) => ({ s_a: -2n, s_b: 1n, s_c: -1n })[m]), 0x1f01fffen);
});

const COMB = `#include "ap_int.h"
struct P { short x; char y; bool z; ap_int<5> w; };
void upd(P &a, P *b, const P &c, int k) {
  a.x += k + c.x;
  a.z = !a.z;
  if (k > 2) b->y = a.y + c.w;
  b->w = k;
}
int main() {
  P a = {1, 2, true, -3}, b = {4, 5, false, 6}, c = {-7, 1, 0, -9};
  int s = 0;
  for (int i = 0; i < 5; i++) { upd(a, &b, c, i); s += a.x + a.z + b.y + b.w; }
  return s == 0;
}
`;

test('#1628 a combinational module: a struct read an input, a struct written its _i, _o and _o_ap_vld (its members not written as they were), co-simulated in VHDL and Verilog, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(COMB, { file: 'upd.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.equal(r.gen.sequential, false);
    assert.deepEqual(ports(r), ['a_i:40', 'a_o:40', 'a_o_ap_vld:1', 'b_i:40', 'b_o:40', 'b_o_ap_vld:1', 'c:40', 'k:32']);
    assert.deepEqual(r.gen.diagnostics, []);
  }
});

const SEQ = `#include "ap_int.h"
struct In { char lo; ap_uint<12> hi; };
struct Q { In i; bool o; long long big; };
Q mix(const Q &in, Q *out, int k) {
  static int acc = 0;
  Q r;
  for (int j = 0; j < 3; j++) acc += in.i.lo * j + k;
  r.i.lo = acc;
  r.i.hi = in.i.hi + k;
  r.o = acc & 1;
  r.big = (long long)acc << 33;
  out->i = r.i;
  return r;
}
int main() {
  Q a = {{3, 100}, true, -5}, b = {{0, 0}, false, 9};
  long long s = 0;
  for (int c = 0; c < 4; c++) { Q r = mix(a, &b, c); s += r.i.lo + r.i.hi + r.o + (r.big >> 33) + b.i.lo + b.big; a.i.lo += 5; }
  return s == 0;
}
`;

test('#1628 a sequential module: nested structs, a struct returned (ap_return), one written in part, named as reserved words (in_r, out_r_…, said); co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SEQ, { file: 'mix.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.equal(r.gen.sequential, true);
    assert.deepEqual(ports(r), ['in_r:96', 'out_r_i:96', 'out_r_o:96', 'out_r_o_ap_vld:1', 'k:32', 'ap_return:96']);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "4 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module",
      "4 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"]);
  }
});

test('#1628 the co-simulation finds an HDL whose struct\'s fields differ (a member read from another one\'s bits)', () => {
  const alter = (h) => h.replace(/ap_s_c_x = c\[15:0\]/, 'ap_s_c_x = c[23:8]').replace(/ap_s_c_x <= c\(15 downto 0\)/, 'ap_s_c_x <= c(23 downto 8)');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(COMB, { file: 'upd.cpp', lang, alter });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, false);
    assert.ok(r.mismatches.some((m) => m.port === 'a_o'), JSON.stringify(r.mismatches, big));
  }
});

test('#1628 a struct whose members meet its ports\' names (a member i, a struct a: a_i) and an unused struct: the HDL elaborates', () => {
  const src = 'struct S { int i; int o; };\nstruct U { int u; };\nint f(S &a, U v) {\n  a.i = a.o + 1;\n  return a.i;\n}\nint main() { S a = {1, 2}; U v = {3}; return f(a, v) == 3 ? 0 : 1; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 's.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
    assert.deepEqual(ports(r), ['a_i:64', 'a_o:64', 'a_o_ap_vld:1', 'v:32', 'ap_return:32']);
  }
  assert.deepEqual(cToHdl(src, { file: 's.cpp' }).diagnostics, []);
});
