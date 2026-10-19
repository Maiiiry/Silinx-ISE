// Silinx - SDF (Standard Delay Format, IEEE 1497) of the post-place & route simulation models (#122): the file
// the Silinx toolchain writes beside its model (build/netgen/par/<top>_timesim.sdf, as ISE's netgen writes
// <top>_timesim.sdf), and the annotation that gives Silinx's simulator the delays of an SDF.
//
//   writeSdf(structure, { design })       the SDF of a model (core/sim-model.js postParModels): per instance
//                                         (CELL) its connections' delays (PORT: the routing's), its paths
//                                         (IOPATH: from an input, or from the clock edge, to an output) and its
//                                         setup checks (SETUPHOLD), in picoseconds
//   parseSdf(text)                        { timescale, cells: Map(instance -> { type, port: Map(pin -> ps),
//                                         iopath: [{ from, to, ps, edge }], setup: [{ pin, clock, edge, setup, hold }] }) }
//   annotateSdf(text, lang, sdf)          the netlist (VHDL or Verilog, a SIMPRIM netlist as Silinx's or ISE's
//                                         netgen writes it) with the SDF's delays built in: { text, annotated,
//                                         missing: [instances of the SDF not in the netlist] }
//
// The annotation, as a VITAL simulator applies an SDF: each input of an instance reads its signal through a
// transport delay (the connection's, the PORT delay: a wire passes every pulse) and an inertial one (the
// instance's path from that input, IOPATH: the element filters the pulses shorter than its delay, the glitches):
// an X_SDFDLY of Silinx's SIMPRIM library (`reject GATE inertial … after WIRE + GATE`, evaluated natively);
// an output driven at a clock edge (a flip-flop, a block RAM, a shift register…) is delayed by its clock-to-out
// path; each setup check is an X_SDFCHECK (natively evaluated too) that reports a timing violation when the input changed less than its
// setup time before the clock's edge (a warning), from 100 ns on: as in ISE's timing simulation, whose global
// set / reset (glbl's GSR) holds the first 100 ns, while the values of time 0 settle through the delays. A combinational
// element's paths are applied on its inputs, which is exact for an element of one output (the SIMPRIM gates), or on
// its outputs when their delay depends on the output only (a multiplier's product bits).
import { primitiveInterface } from './netlist-hier.js';

const ps = ns => Math.max(0, Math.round(ns * 1000));
/** The checks start after the start-up (ps): ISE's glbl holds GSR for the first 100 ns. */
export const CHECKS_FROM = 100000;

/** The SDF of a model's structure (its instances' arcs, ns: { port, iopath, clocked, setup }). */
export function writeSdf(M, { design }) {
  const L = ['(DELAYFILE', '(SDFVERSION "3.0")', `(DESIGN "${design}")`, '(VENDOR "Silinx")', '(PROGRAM "Silinx toolchain")', '(DIVIDER /)', '(TIMESCALE 1 ps)'];
  for (const it of M.insts) {
    const a = it.arcs;
    if (!a) continue;
    const delays = [
      ...(a.port || []).map(([p, d]) => `        (PORT ${p} ( ${ps(d)} ))`),
      ...(a.iopath || []).map(([f, t, d]) => `        (IOPATH ${f} ${t} ( ${ps(d)} ))`),
      ...(a.clocked || []).map(([f, t, d]) => `        (IOPATH (posedge ${f}) ${t} ( ${ps(d)} ))`),
    ];
    const checks = (a.setup || []).map(([p, k, d]) => `      (SETUPHOLD ${p} (posedge ${k}) (${ps(d)}) (0))`);
    if (!delays.length && !checks.length) continue;
    L.push(`(CELL (CELLTYPE "${it.type}")`, `  (INSTANCE ${it.name})`);
    if (delays.length) L.push('    (DELAY', '      (ABSOLUTE', ...delays, '      )', '    )');
    if (checks.length) L.push('    (TIMINGCHECK', ...checks, '    )');
    L.push(')');
  }
  L.push(')');
  return `${L.join('\n')}\n`;
}

// ------------------------------------------------------------------ reading
// s-expressions: ( ... ) lists of words and "strings"
function tree(text) {
  const re = /"(?:[^"\\]|\\.)*"|[()]|[^\s()"]+/g;
  const stack = [[]];
  for (const m of String(text).replace(/\/\/[^\n]*/g, '').matchAll(re)) {
    const t = m[0];
    if (t === '(') { const l = []; stack.at(-1).push(l); stack.push(l); } else if (t === ')') { if (stack.length > 1) stack.pop(); } else stack.at(-1).push(t);
  }
  return stack[0];
}
const UNITS = { s: 1e12, ms: 1e9, us: 1e6, ns: 1e3, ps: 1, fs: 1e-3 };
// a delay value ( 12 ) / ( 1:2:3 ) / ( 1:2:3 ) ( … ): its typical value (the middle one), in the file's unit
const value = v => { const t = Array.isArray(v) ? v.find(x => typeof x === 'string') : v; if (t === undefined) return null; const p = String(t).split(':'); const x = parseFloat(p[p.length === 3 ? 1 : 0]); return Number.isFinite(x) ? x : null; };
// a port spec: A, A[3], (posedge CLK)
const portOf = x => (Array.isArray(x) ? { edge: x[0], pin: x[1] } : { edge: null, pin: x });

/** Read an SDF: its cells by instance (the hierarchy divider's path as written), delays in ps. */
export function parseSdf(text) {
  const root = tree(text)[0] || [];
  let scale = 1000;   // (SDF's default unit: 1 ns)
  const cells = new Map();
  for (const e of root) {
    if (!Array.isArray(e)) continue;
    if (e[0] === 'TIMESCALE') { const m = /^([\d.]+)\s*([a-z]+)$/i.exec(e.slice(1).join(' ')); if (m) scale = +m[1] * (UNITS[m[2].toLowerCase()] ?? 1000); }
    if (e[0] !== 'CELL') continue;
    const type = String(e.find(x => Array.isArray(x) && x[0] === 'CELLTYPE')?.[1] || '').replace(/"/g, '');
    const inst = String(e.find(x => Array.isArray(x) && x[0] === 'INSTANCE')?.[1] ?? '').replace(/\\(.)/g, '$1');
    const cell = cells.get(inst) || { type, port: new Map(), iopath: [], setup: [] };
    cells.set(inst, cell);
    for (const sec of e.filter(x => Array.isArray(x) && (x[0] === 'DELAY' || x[0] === 'TIMINGCHECK'))) {
      const items = sec[0] === 'DELAY' ? sec.filter(Array.isArray).flatMap(a => a.slice(1)) : sec.slice(1);
      for (const it of items) {
        if (!Array.isArray(it)) continue;
        if (it[0] === 'PORT' || it[0] === 'INTERCONNECT') {
          const pin = it[0] === 'PORT' ? it[1] : String(it[2]).split('/').pop();
          const d = value(it[it[0] === 'PORT' ? 2 : 3]);
          if (d !== null) cell.port.set(pin, Math.max(cell.port.get(pin) || 0, d * scale));
        } else if (it[0] === 'IOPATH') {
          const f = portOf(it[1]), d = value(it[3]);
          if (d !== null) cell.iopath.push({ from: f.pin, to: it[2], edge: f.edge, ps: d * scale });
        } else if (it[0] === 'SETUPHOLD' || it[0] === 'SETUP') {
          const k = portOf(it[2]), su = value(it[3]), h = it[0] === 'SETUPHOLD' ? value(it[4]) : 0;
          if (su !== null) cell.setup.push({ pin: portOf(it[1]).pin, clock: k.pin, edge: k.edge || 'posedge', setup: su * scale, hold: (h || 0) * scale });
        }
      }
    }
  }
  return { timescale: scale, cells };
}

// ------------------------------------------------------------------ annotation
const CLOCK_PIN = /^CLK[AB]?$/;
// a formal as the SDF names it: ADDRA(3) / ADDRA[3] -> { base: ADDRA, key: ADDRA[3] }
const formalKey = f => { const m = /^(\w+)\s*[([]\s*(\d+)\s*[)\]]$/.exec(f.trim()); return m ? { base: m[1], key: `${m[1]}[${m[2]}]` } : { base: f.trim(), key: f.trim() }; };

// The paths through an element of several outputs whose delay depends on the output only (a multiplier's A / B -> P[j]):
// applied on those outputs (outputs: Map(output -> ps)); the others on the inputs
const clocked = a => !!a.edge || CLOCK_PIN.test(a.from);
function splitPaths(cell) {
  if (cell.split) return cell.split;
  const to = new Map();
  for (const a of cell.iopath) if (!clocked(a)) { if (!to.has(a.to)) to.set(a.to, new Set()); to.get(a.to).add(a.ps); }
  const outputs = new Map();
  if (to.size > 1) for (const [o, ds] of to) if (ds.size === 1) outputs.set(o, [...ds][0]);
  return (cell.split = { outputs });
}
// the delays of one instance's pin from its cell: { input: { wire, gate } | null, output: ps | null }
function pinDelays(cell, type, formal) {
  const { base, key } = formalKey(formal);
  const itf = primitiveInterface(type)?.ports.find(p => p.name.toUpperCase() === base.toUpperCase());
  const dir = itf?.dir || (cell.iopath.some(a => a.to === base || a.to === key) ? 'out' : 'in');
  const at = a => a === base || a === key;
  const { outputs } = splitPaths(cell);
  if (dir === 'out') {
    const d = Math.max(0, ...cell.iopath.filter(a => at(a.to) && clocked(a)).map(a => a.ps), outputs.get(key) ?? outputs.get(base) ?? 0);
    return { output: d > 0 ? d : null };
  }
  const wire = cell.port.get(key) ?? cell.port.get(base) ?? 0;
  const gate = Math.max(0, ...cell.iopath.filter(a => at(a.from) && !clocked(a) && !outputs.has(a.to)).map(a => a.ps));
  return { input: wire > 0 || gate > 0 ? { wire, gate } : null };
}
const isConst = a => /^('[01xXzZuU-]'|"[01xXzZ]*"|open|[01]'b[01xz]|1'b[01xz]|\d+'[bhd][0-9a-fA-FxXzZ]+|GND|VCC)$/.test(a.trim());

/**
 * The netlist text (VHDL or Verilog) with the delays and setup checks of the SDF built in (above). sdf: parseSdf's.
 * Returns { text, annotated: number of instances, missing: [SDF instances not in the netlist] }.
 */
export function annotateSdf(text, lang, sdf) {
  const vhdl = lang === 'vhdl';
  const taken = new Set([...String(text).matchAll(/\b([A-Za-z_]\w*)\b/g)].map(m => m[1].toLowerCase()));
  const fresh = base => { let s = base.replace(/\W+/g, '_').replace(/^_+|_+$/g, '').replace(/__+/g, '_'); if (!/^[A-Za-z]/.test(s)) s = `S_${s}`; let t = s; for (let k = 1; taken.has(t.toLowerCase()); k++) t = `${s}_${k}`; taken.add(t.toLowerCase()); return t; };
  const decls = [], stmts = [];
  const seen = new Set();
  const D = x => (vhdl ? `${Math.round(x)} ps` : `${Math.round(x)}`);
  // a delay: an X_SDFDLY (Silinx's SIMPRIM library, evaluated natively: core/native.js) from `from` to `to`
  const delay = (inst, from, to, wire, gate) => {
    const name = fresh(`${to}_SDF`), w = Math.round(wire), g = Math.round(gate);
    stmts.push(vhdl ? `  ${name} : X_SDFDLY\n    generic map (\n      WIRE_PS => ${w},\n      GATE_PS => ${g}\n    )\n    port map (\n      I => ${from},\n      O => ${to}\n    );`
      : `  X_SDFDLY #(\n    .WIRE_PS(${w}),\n    .GATE_PS(${g})\n  ) ${name} (\n    .I(${from}),\n    .O(${to})\n  );`);
  };
  // an input's actual through its delays (a new signal); an output's actual driven from a new signal, delayed
  const delayIn = (inst, formal, actual, d) => {
    const s = fresh(`${inst}_${formal}_DLY`);
    decls.push(vhdl ? `  signal ${s} : STD_LOGIC;` : `  wire ${s};`);
    delay(inst, actual, s, d.wire, d.gate);
    return s;
  };
  const delayOut = (inst, formal, actual, d) => {
    const s = fresh(`${inst}_${formal}_Q`);
    decls.push(vhdl ? `  signal ${s} : STD_LOGIC;` : `  wire ${s};`);
    delay(inst, s, actual, 0, d);
    return s;
  };
  // the setup checks of an instance: its pins' (annotated) actuals
  const checks = (inst, cell, act) => {
    for (const c of cell.setup) {
      if (!(c.setup > 0)) continue;
      const clk = act.get(c.clock);
      const pins = [...act.keys()].filter(k => k === c.pin || formalKey(k).base === c.pin);
      if (!clk || isConst(clk)) continue;
      for (const p of pins) {
        const d = act.get(p);
        if (isConst(d)) continue;
        const name = fresh(`${inst}_${p}_SETUP`), neg = c.edge === 'negedge';
        stmts.push(vhdl ? `  ${name} : X_SDFCHECK\n    generic map (\n      SETUP_PS => ${Math.round(c.setup)},\n      FROM_PS => ${CHECKS_FROM},\n      NEGEDGE => ${neg ? 'TRUE' : 'FALSE'},\n      NAME => "${inst}.${p}"\n    )\n    port map (\n      D => ${d},\n      CLK => ${clk}\n    );`
          : `  X_SDFCHECK #(\n    .SETUP_PS(${Math.round(c.setup)}),\n    .FROM_PS(${CHECKS_FROM}),\n    .NEGEDGE("${neg ? 'TRUE' : 'FALSE'}"),\n    .NAME("${inst}.${p}")\n  ) ${name} (\n    .D(${d}),\n    .CLK(${clk})\n  );`);
      }
    }
  };
  let annotated = 0, out;
  if (vhdl) {
    const re = /(\n[ \t]*)(\w+)\s*:\s*(\w+)\s*\n((?:[ \t]*generic\s+map\s*\([\s\S]*?\)\s*\n)?)([ \t]*port\s+map\s*\()([\s\S]*?)(\n[ \t]*\)\s*;)/g;
    out = String(text).replace(re, (all, ind, inst, type, gen, head, assoc, tail) => {
      const cell = sdf.cells.get(inst);
      if (!cell) return all;
      seen.add(inst);
      annotated++;
      const act = new Map();
      const items = assoc.split(/,(?=\s*\n)/).map(line => {
        const m = /^(\s*)([\w]+(?:\s*\(\s*\d+\s*\))?)\s*=>\s*([\s\S]*?)\s*$/.exec(line);
        if (!m) return line;
        let [, sp, formal, actual] = m;
        if (!isConst(actual)) {
          const d = pinDelays(cell, type, formal);
          if (d.input) actual = delayIn(inst, formal, actual, d.input);
          else if (d.output) actual = delayOut(inst, formal, actual, d.output);
        }
        act.set(formal.replace(/\s+/g, ''), actual);
        return `${sp}${formal} => ${actual}`;
      });
      checks(inst, cell, act);
      return `${ind}${inst} : ${type}\n${gen}${head}${items.join(',')}${tail}`;
    });
    const arch = /(\barchitecture\s+(\w+)\s+of\s+\w+\s+is\b[\s\S]*?)(\n\s*begin\b)([\s\S]*)(\n\s*end\s+(?:architecture\s+)?\2\s*;)(?![\s\S]*\barchitecture\b)/i.exec(out);
    if (arch) out = out.slice(0, arch.index) + arch[1] + (decls.length ? `\n${decls.join('\n')}` : '') + arch[3] + arch[4] + (stmts.length ? `\n${stmts.join('\n')}` : '') + arch[5] + out.slice(arch.index + arch[0].length);
  } else {
    const re = /(\n[ \t]*)(\w+)(\s*#\s*\([\s\S]*?\n[ \t]*\))?\s+(\w+)\s*\(\n([\s\S]*?)\n([ \t]*\)\s*;)/g;
    out = String(text).replace(re, (all, ind, type, params, inst, conns, tail) => {
      const cell = sdf.cells.get(inst);
      if (!cell || /^(module|input|output|wire|reg|assign)$/.test(type)) return all;
      seen.add(inst);
      annotated++;
      const act = new Map();
      const items = conns.split(/,(?=\s*\n)/).map(line => {
        const m = /^(\s*)\.(\w+)\((.*)\)\s*$/.exec(line);
        if (!m) return line;
        const [, sp, formal, actualText] = m;
        const vec = /^\{(.*)\}$/.exec(actualText.trim());
        if (vec) {
          // a vector formal, its bits most significant first
          const bits = vec[1].split(',').map(x => x.trim()), n = bits.length;
          const nb = bits.map((a, j) => {
            const f = `${formal}[${n - 1 - j}]`;
            if (isConst(a)) { act.set(f, a); return a; }
            const d = pinDelays(cell, type, f);
            const r = d.input ? delayIn(inst, `${formal}_${n - 1 - j}`, a, d.input) : d.output ? delayOut(inst, `${formal}_${n - 1 - j}`, a, d.output) : a;
            act.set(f, r);
            return r;
          });
          return `${sp}.${formal}({${nb.join(', ')}})`;
        }
        let actual = actualText.trim();
        if (!isConst(actual)) {
          const d = pinDelays(cell, type, formal);
          if (d.input) actual = delayIn(inst, formal, actual, d.input);
          else if (d.output) actual = delayOut(inst, formal, actual, d.output);
        }
        act.set(formal, actual);
        return `${sp}.${formal}(${actual})`;
      });
      checks(inst, cell, act);
      return `${ind}${type}${params || ''} ${inst} (\n${items.join(',')}\n${tail}`;
    });
    const end = out.lastIndexOf('endmodule');
    const firstInst = out.search(/\n {2}[A-Z]\w*(?: #\(| \w+ \()/);
    if (end >= 0 && firstInst >= 0) out = out.slice(0, firstInst) + (decls.length ? `\n${decls.join('\n')}` : '') + out.slice(firstInst, end) + (stmts.length ? `${stmts.join('\n')}\n` : '') + out.slice(end);
    // (the SDF's picoseconds)
    out = `\`timescale 1 ps / 1 ps\n${out}`;
  }
  return { text: out, annotated, missing: [...sdf.cells.keys()].filter(k => !seen.has(k)) };
}
