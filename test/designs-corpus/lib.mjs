// The logic of the design corpus runner (test/designs-corpus/run.mjs) that needs no design: the
// manifest's validation, the comparison of a run with the expectations (results and warnings), the
// normalization of warnings, the I/O wrapper of a design with more ports than the package has pins.
// Unit-tested on synthetic data (test/designs-corpus.test.js).

/** The stages of a design, in order. Each records 'pass' (the flow: 'complete') or a reason. */
export const STAGES = ['frontend', 'tb', 'synth', 'diff', 'flow'];

/** A status that the run must keep (a regression when it is lost). */
export const isGood = s => s === 'pass' || s === 'complete';

/** The first word of a status: pass, complete, skip, unsupported, mismatch, fail, error, too large. */
export const kindOf = s => (s === undefined ? 'none' : /^too large/.test(s) ? 'too large' : String(s).split(':')[0]);

// licences accepted in the corpus: permissive or copyleft open-source licences
const LICENCES = /\b(MIT|ISC|BSD|Apache|LGPL|GPL|MPL|CERN-OHL|Solderpad|Unlicense|CC0|OpenCores BSD-style|VTR benchmarks)\b/;
const PARTS = new Set(['xc3s100e', 'xc3s250e', 'xc3s500e', 'xc3s1200e', 'xc3s1600e']);
const SHA = /^[0-9a-f]{40}$/;

/** Problems of a manifest (test/designs-corpus/manifest.json): [] when it is valid. */
export function validateManifest(m) {
  const out = [];
  if (!m || typeof m !== 'object') return ['the manifest is not an object'];
  const sources = m.sources || {};
  if (!Object.keys(sources).length) out.push('no sources');
  for (const [id, s] of Object.entries(sources)) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(s.repo || '')) out.push(`source ${id}: repo must be owner/name`);
    if (!SHA.test(s.commit || '')) out.push(`source ${id}: commit must be a full commit hash (pinned), not '${s.commit}'`);
    if (!/^https:\/\//.test(s.url || '')) out.push(`source ${id}: url missing`);
    if (!LICENCES.test(s.licence || '')) out.push(`source ${id}: licence '${s.licence}' is not a recognised open-source licence`);
    if (!s.licenceFile) out.push(`source ${id}: licenceFile missing`);
  }
  const names = new Set();
  for (const d of m.designs || []) {
    const n = d.name || '?';
    if (!/^[\w.-]+$/.test(n)) out.push(`design ${n}: name must be a plain word`);
    if (names.has(n)) out.push(`design ${n}: name used twice`);
    names.add(n);
    if (!sources[d.source]) out.push(`design ${n}: unknown source '${d.source}'`);
    if (d.licence !== undefined && !LICENCES.test(d.licence)) out.push(`design ${n}: licence '${d.licence}' is not a recognised open-source licence`);
    if (!['verilog', 'vhdl', 'mixed'].includes(d.language)) out.push(`design ${n}: language must be verilog, vhdl or mixed`);
    if (!d.top) out.push(`design ${n}: top missing`);
    if (!Array.isArray(d.files) || !d.files.length) out.push(`design ${n}: files missing`);
    else {
      if (new Set(d.files).size !== d.files.length) out.push(`design ${n}: a file listed twice`);
      for (const f of d.files) if (f.split('/').includes('..') || f.startsWith('/')) out.push(`design ${n}: unsafe path ${f}`);
    }
    if (!d.size || !PARTS.has(d.size.target)) out.push(`design ${n}: size.target must be one of ${[...PARTS].join(', ')}`);
    if (d.generics && Object.values(d.generics).some(v => !Number.isInteger(v))) out.push(`design ${n}: generics must be integers`);
    const tb = d.testbench;
    if (tb) {
      if (!tb.top) out.push(`design ${n}: testbench.top missing`);
      if (!tb.pass) out.push(`design ${n}: testbench.pass (what a passing run prints) missing`);
      if (!Array.isArray(tb.files) || !tb.files.length) out.push(`design ${n}: testbench.files missing`);
      try { new RegExp(tb.pass); if (tb.fail) new RegExp(tb.fail); } catch (e) { out.push(`design ${n}: testbench pattern: ${e.message}`); }
      if (tb.generics && Object.values(tb.generics).some(v => !Number.isInteger(v))) out.push(`design ${n}: testbench.generics must be integers`);
      if (tb.until && !/^\d+(\.\d+)?\s*(fs|ps|ns|us|ms)$/.test(tb.until)) out.push(`design ${n}: testbench.until must be a time such as '2 ms'`);
    }
  }
  if (!names.size) out.push('no designs');
  return out;
}

/** A time such as '2 ms' in the simulator's unit (ps). */
export function parseTime(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|ms)$/.exec(String(s).trim());
  if (!m) throw new Error(`not a time: ${s}`);
  return Math.round(+m[1] * { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6, ms: 1e9 }[m[2]]);
}

/**
 * A warning as it is recorded: one line, without absolute paths or the cache's folders, without
 * Yosys's generated numbers ($auto$…:123$456), bounded. Equal warnings of different runs are equal
 * strings.
 */
export function normalizeWarning(w) {
  return String(w)
    .replace(/\s+/g, ' ').trim()
    .replace(/(?:\/[^\s:'"]+)*\/\.cache\/designs-corpus\/[^/\s]+\/[0-9a-f]{40}\//g, '')
    .replace(/(?:[A-Za-z]:)?(?:[\\/][^\s:'"\\/]+)+[\\/]([^\s:'"\\/]+)/g, '$1')
    .replace(/\$(auto|abc|techmap|flatten|opt|memory|proc)\$[^\s']*?(\$\d+)+/g, '$$$1')
    .replace(/\$(\w+)\$\d+/g, '$$$1')
    .slice(0, 300);
}

/** Warnings with repeats counted: ['message', 'other (x3)'] (sorted, stable between runs). */
export function countWarnings(list) {
  const n = new Map();
  for (const w of list) { const k = normalizeWarning(w); n.set(k, (n.get(k) || 0) + 1); }
  return [...n].map(([k, c]) => (c > 1 ? `${k} (x${c})` : k)).sort();
}

/**
 * The results of a run against the expectations. Both: { design: { stage: status, …,
 * warnings: { stage: [warning] } } }. Returns { regressions, improvements, changed, newWarnings,
 * vanishedWarnings, fresh, missing, failed } where regressions are stages expected good (pass /
 * complete) that are not, improvements stages good now that were not, changed other status changes,
 * newWarnings / vanishedWarnings [{ design, stage, warning }], fresh designs not in the
 * expectations, missing expected designs that did not run (only when `ran` lists what ran);
 * failed: the run must fail (a regression or a warning that appeared or vanished).
 */
export function compareExpectations(expected, results, { ran = null } = {}) {
  const regressions = [], improvements = [], changed = [], newWarnings = [], vanishedWarnings = [], fresh = [], missing = [];
  for (const [d, r] of Object.entries(results)) {
    const e = expected[d];
    if (!e) { fresh.push(d); continue; }
    for (const st of STAGES) {
      const a = e[st], b = r[st];
      if (a === b) continue;
      if (isGood(a) && !isGood(b)) regressions.push({ design: d, stage: st, expected: a, got: b });
      else if (!isGood(a) && isGood(b)) improvements.push({ design: d, stage: st, expected: a, got: b });
      else changed.push({ design: d, stage: st, expected: a, got: b });
    }
    for (const st of STAGES) {
      const ew = e.warnings?.[st] || [], rw = r.warnings?.[st] || [];
      const left = new Map();
      for (const w of ew) left.set(w, (left.get(w) || 0) + 1);
      for (const w of rw) {
        if (left.get(w)) left.set(w, left.get(w) - 1);
        else newWarnings.push({ design: d, stage: st, warning: w });
      }
      for (const [w, k] of left) for (let i = 0; i < k; i++) vanishedWarnings.push({ design: d, stage: st, warning: w });
    }
  }
  if (ran) for (const d of Object.keys(expected)) if (ran.includes(d) && !results[d]) missing.push(d);
  const failed = regressions.length + newWarnings.length + vanishedWarnings.length + missing.length > 0;
  return { regressions, improvements, changed, newWarnings, vanishedWarnings, fresh, missing, failed };
}

/** The expectations after a run: the results of the designs that ran, the others kept. Times and
 *  details are not expectations. */
export function updatedExpectations(expected, results) {
  const out = { ...expected };
  for (const [d, r] of Object.entries(results)) {
    // a stage that did not run (--stages) keeps its expectation
    const old = expected[d] || {}, e = {}, w = {};
    for (const st of STAGES) {
      const ranSt = r[st] !== undefined;
      if (ranSt) e[st] = r[st]; else if (old[st] !== undefined) e[st] = old[st];
      const ws = ranSt ? r.warnings?.[st] : old.warnings?.[st];
      if (ws?.length) w[st] = ws;
    }
    if (Object.keys(w).length) e.warnings = w;
    out[d] = e;
  }
  return Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
}

/**
 * Verilog of a wrapper that gives a design with more port bits than the package has pins a few
 * pins: the inputs (all but the clocks) are loaded serially from one pin through a shift register,
 * the outputs are registered and XOR-reduced to one pin, so no logic is optimised away. It is how
 * the back end (pack, place, route, bitgen) is tested on such designs; the design's behaviour is
 * checked before, on its own ports (diff stage). ports: [{ name, dir: 'in' | 'out' | 'inout', w }],
 * clocks: names of the clock inputs (kept as pins), generics: { NAME: integer }. Returns
 * { name, text } (ports clk, din, dout plus each clock other than the first).
 */
export function ioWrapper(top, ports, { clocks = [], generics = {}, name = 'corpus_io_wrap' } = {}) {
  const lc = new Set(clocks.map(c => c.toLowerCase()));
  const ins = ports.filter(p => p.dir === 'in' && !lc.has(p.name.toLowerCase()));
  const outs = ports.filter(p => p.dir === 'out');
  const clks = ports.filter(p => p.dir === 'in' && lc.has(p.name.toLowerCase()));
  if (ports.some(p => p.dir === 'inout')) throw new Error('ioWrapper: inout ports');
  const nin = ins.reduce((s, p) => s + p.w, 0), nout = outs.reduce((s, p) => s + p.w, 0);
  const esc = n => (/^[A-Za-z_][\w$]*$/.test(n) ? n : `\\${n} `);
  const lines = [];
  lines.push(`// generated by test/designs-corpus (Silinx ISE): ${top} with its inputs loaded serially and its outputs XOR-reduced`);
  lines.push(`module ${name} (input wire clk, ${clks.slice(1).map(p => `input wire ${esc(p.name)}, `).join('')}input wire din, output reg dout);`);
  if (nin) lines.push(`  reg [${nin - 1}:0] sin = 0;`, `  always @(posedge clk) sin <= ${nin === 1 ? 'din' : `{sin[${nin - 2}:0], din}`};`);
  if (nout) lines.push(`  wire [${nout - 1}:0] sout;`, `  reg [${nout - 1}:0] sreg = 0;`, '  always @(posedge clk) begin sreg <= sout; dout <= ^sreg; end');
  else lines.push("  always @(posedge clk) dout <= 1'b0;");
  const conns = [];
  let i = 0;
  for (const p of ins) { conns.push(`.${esc(p.name)}(sin[${i + p.w - 1}:${i}])`); i += p.w; }
  i = 0;
  for (const p of outs) { conns.push(`.${esc(p.name)}(sout[${i + p.w - 1}:${i}])`); i += p.w; }
  clks.forEach((p, k) => conns.push(`.${esc(p.name)}(${k === 0 ? 'clk' : esc(p.name)})`));
  const gm = Object.entries(generics).map(([k, v]) => `.${k}(${v})`).join(', ');
  lines.push(`  ${esc(top)} ${gm ? `#(${gm}) ` : ''}dut (${conns.join(', ')});`);
  lines.push('endmodule');
  return { name, text: `${lines.join('\n')}\n` };
}

/** Verilog of a wrapper with the same ports as `top` that sets its generics (a Silinx project has no
 *  generics of its own). Returns { name, text }. */
export function paramWrapper(top, ports, generics, { name = 'corpus_param_wrap' } = {}) {
  const esc = n => (/^[A-Za-z_][\w$]*$/.test(n) ? n : `\\${n} `);
  const decl = p => `${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} wire ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${esc(p.name)}`;
  const gm = Object.entries(generics).map(([k, v]) => `.${k}(${v})`).join(', ');
  return {
    name,
    text: `// generated by test/designs-corpus (Silinx ISE): ${top} with its generics set\n`
      + `module ${name} (${ports.map(decl).join(', ')});\n`
      + `  ${esc(top)} ${gm ? `#(${gm}) ` : ''}dut (${ports.map(p => `.${esc(p.name)}(${esc(p.name)})`).join(', ')});\n`
      + 'endmodule\n',
  };
}

/** The UCF of a design's clock on the Basys2's oscillator pin (B8, a global clock pad; 50 MHz). No I/O
 *  standard: all the ports keep the default (LVCMOS25), so one bank voltage fits them all. */
// the devices of the flow, smallest first: a design too large for one is tried on the next (#7);
// the clock pad, B8, is the oscillator's on the Basys2 and the Nexys2
export const FLOW_PARTS = ['xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4'];
/** 'xc3s500efg320-4' -> 'XC3S500E' */
export const chipOf = part => part.replace(/(cp|fg)\d+-\d$/, '').toUpperCase();
/** 'xc3s500efg320-4' -> a project's device { family, part, package, speed } */
export function deviceOf(part) {
  const m = /^(xc3s\d+e)(cp132|fg320)-(\d)$/.exec(part);
  if (!m) throw new Error(`not a device of the flow: ${part}`);
  return { family: 'spartan3e', part: m[1], package: m[2], speed: `-${m[3]}` };
}

export function boardClockUcf(port) {
  return `# the clock on the Basys2's oscillator (generated by test/designs-corpus)\n`
    + `NET "${port}" LOC = "B8" ;\n`
    + `NET "${port}" CLOCK_DEDICATED_ROUTE = FALSE ;\n`
    + `NET "${port}" TNM_NET = "${port}" ;\n`
    + `TIMESPEC "TS_${port}" = PERIOD "${port}" 20 ns HIGH 50% ;\n`;
}
