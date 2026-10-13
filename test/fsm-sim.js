// Simulation of a state machine (core/fsm.js) against its generated HDL: random inputs through a Verilog
// testbench, the outputs sampled each cycle (test/fsm.test.js, test/diagram-corpus.test.js).
import assert from 'node:assert/strict';
import { simulateFsm } from '../core/fsm.js';
import { simulate } from '../core/compile.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

export function randomVectors(m, n, seed) {
  const r = rng(seed);
  const cur = {};
  const out = [];
  for (let c = 0; c < n; c++) {
    for (const i of m.inputs) if (cur[i.name] == null || r() % 3 === 0) cur[i.name] = r() % (1 << i.width);
    out.push({ ...cur });
  }
  return out;
}

function testbench(m, vectors, lower) {
  const nm = (s) => (lower ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const on = m.reset.active === 'high' ? 1 : 0;
  const L = ['module tb;', `  reg clk = 0; reg rst = ${on};`];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = [`.${nm(m.clock)}(clk)`, `.${nm(m.reset.name)}(rst)`, ...m.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  L.push(`  ${nm(m.name)} dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', `    #12 rst = ${1 - on};`);
  const fmt = m.outputs.map(() => '%b').join('_');
  for (const v of vectors) {
    const asg = m.inputs.map((i) => `i_${i.name} = ${i.width}'d${v[i.name]};`).join(' ');
    L.push(`    ${asg} #2 $display("${fmt}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}

/** Outputs per cycle of the generated HDL (strings like '1_01'). */
export function runHdl(code, lang, m, vectors) {
  const tb = testbench(m, vectors, lang === 'vhdl');
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${lang} simulation errors`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
}
/** The same from the reference model. */
export function runModel(m, vectors) {
  return simulateFsm(m, vectors).map((row) => m.outputs.map((o) => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_'));
}

