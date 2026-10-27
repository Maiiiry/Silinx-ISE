// Silinx C (#1528): C/RTL co-simulation, as Vitis HLS's: the test bench's calls of the top function (the C simulation,
// core/c-interp.js) replayed on the generated HDL (core/c-hdl.js) in Silinx's simulator, a combinational module's
// inputs set one call at a time, a sequential one's through its block protocol (ap_start, then ap_done); each
// result compared with the C's: ap_return, a pointer output (taken when its _ap_vld is 1), a read-write pointer.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   cosimulate(source, { file, lang, maxCycles }) ->
//     { ok, pass, calls, mismatches: [{ call, port, expected, got }], latency: { min, max, avg } | null,
//       output, sim: the C simulation's result, gen: cToHdl's result, errors: [message] }
import { simulateC } from './c-interp.js';
import { cToHdl } from './c-hdl.js';
import { simulate } from './compile.js';

export const MAX_CYCLES = 100000;
const mask = (w) => (1n << BigInt(w)) - 1n;
const hex = (v, w) => `${w}'h${(BigInt(v) & mask(w)).toString(16)}`;

/** The Verilog test bench replaying the calls: one line of hex values per call (and the protocol's faults last). */
export function cosimBench(gen, calls, { maxCycles = MAX_CYCLES } = {}) {
  const port = (n) => gen.ports.find((p) => p.name === n);
  const seq = !!port('ap_clk');
  const L = ['module silinx_cosim_tb;', '  integer cyc, bad = 0;'];
  if (seq) L.push('  reg ap_clk = 0, ap_rst = 1, ap_start = 0;');
  for (const p of gen.ports) if (!['ap_clk', 'ap_rst', 'ap_start'].includes(p.name)) L.push(`  ${p.dir === 'in' ? 'reg' : 'wire'} ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name};`);
  const outs = gen.ports.filter((p) => p.dir === 'out' && p.role === 'arg');
  for (const o of outs) L.push(`  reg [${o.w - 1}:0] cap_${o.name}; reg got_${o.name};`);
  L.push(`  ${gen.top} dut(${gen.ports.map((p) => `.${p.name}(${p.name})`).join(', ')});`);
  if (seq) {
    L.push('  always #5 ap_clk = ~ap_clk;', '  always @(posedge ap_clk) begin');
    for (const o of outs) if (port(`${o.name}_ap_vld`)) L.push(`    if (${o.name}_ap_vld) begin cap_${o.name} <= ${o.name}; got_${o.name} <= 1; end`);
    L.push('  end');
  }
  L.push('  initial begin');
  if (seq) L.push('    #12 ap_rst = 0;');
  else if (port('ap_start')) L.push('    ap_start = 1;');
  const shown = [port('ap_return') ? 'ap_return' : null, ...outs.flatMap((o) => (seq || port(`${o.name}_ap_vld`) ? [seq ? `cap_${o.name}` : o.name, seq ? `got_${o.name}` : `${o.name}_ap_vld`] : [o.name, "1'b1"])), seq ? 'cyc' : null].filter(Boolean);
  for (const c of calls) {
    const asg = gen.ports.filter((p) => p.dir === 'in' && p.param).map((p) => {
      const v = p.name.endsWith('_i') && c.ptrIn[p.param] !== undefined ? c.ptrIn[p.param] : (c.args[p.param] ?? c.ptrIn[p.param] ?? 0n);
      return `${p.name} = ${hex(v, p.w)};`;
    }).join(' ');
    if (seq) {
      L.push('    if (!ap_idle) bad = bad + 1;', `    ${asg} ${outs.map((o) => `got_${o.name} = 0;`).join(' ')} ap_start = 1; cyc = 0;`, '    @(posedge ap_clk); #1 ap_start = 0;');
      L.push(`    while (!ap_done && cyc < ${maxCycles}) begin @(posedge ap_clk); #1 cyc = cyc + 1; end`, '    if (!ap_ready) bad = bad + 1;', '    @(posedge ap_clk); #1;');
    } else L.push(`    ${asg} #1;`);
    L.push(`    $display("${shown.map(() => '%h').join(' ')}", ${shown.join(', ')});`);
  }
  L.push('    $display("bad %0d", bad);', '    $finish;', '  end', 'endmodule');
  return { text: L.join('\n'), shown, seq };
}

export function cosimulate(source, { file = 'input.c', lang = 'vhdl', maxCycles = MAX_CYCLES, alter = null } = {}) {
  const sim = simulateC(source, { file });
  const gen = cToHdl(source, { file, lang });
  if (alter && gen.ok) gen.hdl = alter(gen.hdl);   // (the tests: an HDL that differs, its mismatches reported)
  const base = { ok: false, pass: false, calls: 0, mismatches: [], latency: null, output: sim.output, sim, gen, errors: [] };
  if (!sim.ok) return { ...base, errors: [sim.error ? `the C simulation failed: line ${sim.error.line}: ${sim.error.message}` : 'the C simulation cannot run: the source has errors'] };
  if (!gen.ok) return { ...base, errors: gen.diagnostics.filter((d) => d.severity === 'error').map((d) => `line ${d.line}: ${d.message}`) };
  if (!sim.calls.length) return { ...base, ok: true, pass: false, errors: [`the test bench (main) does not call the top function '${gen.top}': nothing to compare`] };
  const tb = cosimBench(gen, sim.calls, { maxCycles });
  const r = simulate([{ path: `${gen.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: gen.hdl }, { path: 'silinx_cosim_tb.v', text: tb.text }], 'silinx_cosim_tb', { until: 1e15 });
  if (r.errors.length) return { ...base, errors: r.errors.map((d) => `${d.file || ''}: ${d.message}`) };
  const lines = r.sim.log.map((e) => String(e.text).trim()).filter((s) => s && !/finished/.test(s));
  const bad = Number(/^bad (\d+)/.exec(lines.at(-1) || '')?.[1] ?? 0);
  const rows = lines.filter((s) => !/^bad /.test(s)).map((s) => s.split(/\s+/).map((x) => (/[xz]/i.test(x) ? null : BigInt(`0x${x}`))));
  const port = (n) => gen.ports.find((p) => p.name === n);
  const mismatches = [];
  const cycles = [];
  sim.calls.forEach((c, k) => {
    const row = rows[k] || [];
    let q = 0;
    const say = (p, expected, got) => mismatches.push({ call: k + 1, port: p, expected, got });
    if (port('ap_return')) { const w = port('ap_return').w; const exp = c.ret === null ? null : c.ret & mask(w); const got = row[q++]; if (exp !== null && got !== exp) say('ap_return', exp, got); }
    for (const o of gen.ports.filter((p) => p.dir === 'out' && p.role === 'arg')) {
      const val = row[q++], vld = row[q++];
      const exp = (c.ptrOut[o.param] ?? 0n) & mask(o.w);
      const before = c.ptrIn[o.param] === undefined ? null : c.ptrIn[o.param] & mask(o.w);
      if (vld === 1n) { if (val !== exp) say(o.name, exp, val); }
      else if (o.name.endsWith('_o') ? exp !== before : before !== null && exp !== before) say(`${o.name}_ap_vld`, 1n, vld);
    }
    if (tb.seq) cycles.push(Number(row[q] ?? 0n));
  });
  if (tb.seq && cycles.some((x) => x >= maxCycles)) return { ...base, ok: true, errors: [`a call did not end in ${maxCycles} cycles`], calls: sim.calls.length, mismatches };
  if (bad) mismatches.push({ call: null, port: 'ap_ctrl_hs', expected: 'ap_idle between calls, ap_done with ap_ready', got: `${bad} fault(s)` });
  const latency = tb.seq ? { min: Math.min(...cycles), max: Math.max(...cycles), avg: cycles.reduce((a, b) => a + b, 0) / cycles.length } : null;
  return { ...base, ok: true, pass: !mismatches.length, calls: sim.calls.length, mismatches, latency };
}
