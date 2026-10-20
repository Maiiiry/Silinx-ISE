// Silinx - compiled cycle simulator (#102, #384): the design as one JavaScript function that runs n
// clock cycles, for the Board Emulator's live runs (displays, VGA, long runs at the board's speed).
// The event-driven simulator (core/simulator.js) stays the precise one (X values, delays, waveforms,
// messages); this one computes what the FPGA computes, cycle by cycle, tens of times faster.
//
// The design is read by Yosys at word level: the Verilog Silinx writes for synthesis
// (core/synth-verilog.js toVerilog) through `prep -flatten; memory -nomap` (no technology mapping),
// and its netlist ($add, $eq, $mux, $pmux, $dff, $adff, $mem_v2…, compileNetlist) becomes the code:
//   - every cell output (and input port) is a variable: a number up to 32 bits (its unsigned value),
//     a BigInt above; the combinational cells are computed in topological order as integer operations;
//   - the flip-flops are variables, the memories typed arrays; each starts at its initial value, or 0
//     as on the FPGA after configuration (two-state values: no X, no Z);
//   - the combinational cells in segments, each evaluated only when a value it reads changed (#464: the
//     activity, its guards chosen from a short profile of the code), the results the same;
//   - the main clock's rising edge (and its falling edge, when a flip-flop or the logic uses it) is
//     one step of the loop; every other clock (a counter bit used as a clock, a clock on a button, a
//     gated or inverted clock), the asynchronous resets / loads / sets and the latches are settled
//     after each evaluation: an edge of such a clock fires its flip-flops, the logic is evaluated again
//     until nothing changes;
//   - the Xilinx primitives are Verilog models flattened into the design (core/compiled-prims.js: block
//     RAMs, multipliers, SRL16s, distributed RAMs, clock buffers, and the LUTs, flip-flops, latches and carry
//     chain of a synthesized netlist, #561); a DCM's outputs are variables set by a
//     schedule of their edges in the main clock's cycles (dcmSchedule): the main clock is its input, each
//     cycle's edges are steps of the loop in time order; a DCM whose RST the design drives starts its
//     schedule again after a reset (#465).
// What it cannot compile (a combinational loop, a tristate, an inout port, a primitive with no model
// here, a cascaded DCM with its RST driven) is a CompileError with the reason: the emulator then keeps the
// event-driven simulator.
//
//   const sim = await compileDesign(design, { run })   // run: Yosys (core/synth-open-node.js yosysNode, the browser's worker)
//   sim.set('sw', 5); sim.cycle(1000); sim.get('led') -> 0x2an
//
// Isomorphic ES module (browser + Node), no DOM.
import { toVerilog } from './synth-verilog.js';
import { PRIMITIVE_MODELS, DCM_CELLS, DCM_OUTPUTS, dcmWaves, dcmSchedule, bramInit, simprimCell } from './compiled-prims.js';
import { gateModel } from './compiled-tables.js';

export class CompileError extends Error {}

/** The Yosys commands that read the design at word level (after read_verilog). */
// (#629: a gate-level model, its LUTs a design's logic bit by bit, with its constants folded after the flatten
// (opt_expr -full: the carry chain's constant multiplexers): faster; a behavioural design is slower with it)
export const prepCommands = (top, { gates = false } = {}) => `prep -flatten -top ${top}; ${gates ? 'opt_expr -full; ' : ''}memory -nomap; opt_clean -purge`;
/** Is a design of these primitives a gate-level model (a synthesized netlist: LUTs, SIMPRIM's X_LUTs)? */
export const gateLevel = primitives => primitives.some(p => /^(X_)?LUT\d/.test(p));

/**
 * The design's word-level netlist (Yosys's JSON, parsed): { json, top, warnings: [messages] }.
 * run(args, files, onLine): Yosys (as core/synth-open.js synthesizeOpen's); words: a gate-level model at word level
 * and its irregular logic as tables (core/compiled-words.js, #650, core/compiled-tables.js, #659; false: bit by bit, as
 * Yosys reads it).
 */
export async function netlistOf(design, { run, words = true }) {
  let v;
  // (the SIMPRIM primitives of a post-translate / map / place & route model as their cells, #627)
  try { v = toVerilog(design, { simprim: simprimCell }); } catch (e) { throw new CompileError(e.message); }
  const missing = v.primitives.filter(p => !PRIMITIVE_MODELS[p]);
  if (missing.length) throw new CompileError(`the compiled simulator has no model of ${missing.join(', ')}`);
  // (the primitives' models: core/compiled-prims.js)
  const lib = v.primitives.map(p => (typeof PRIMITIVE_MODELS[p] === 'function' ? PRIMITIVE_MODELS[p]() : PRIMITIVE_MODELS[p])).join('\n');
  const files = { [`${v.top}_cs.v`]: v.text, ...(lib && { 'silinx_cs_prims.v': lib }) };
  const lines = [];
  let out;
  try {
    out = await run(['-q', '-p', `${lib ? 'read_verilog silinx_cs_prims.v; ' : ''}read_verilog -sv ${v.top}_cs.v; ${prepCommands(v.top, { gates: gateLevel(v.primitives) })}; write_json ${v.top}_cs.json`], files, l => lines.push(l));
  } catch (e) { throw new CompileError(lines.find(l => /^ERROR:/.test(l))?.replace(/^ERROR:\s*/, '') || e.message); }
  const text = out[`${v.top}_cs.json`];
  if (!text) throw new CompileError('Yosys wrote no netlist');
  // the warnings: those of the synthesis Verilog's writer, then Yosys's (but how it holds an array, as
  // registers or as a memory, which changes nothing here; a DCM's real generic kept as a string, as read here;
  // and those of the primitives' own models, their latches and FDCP's asynchronous load, #561)
  const quiet = l => /^Warning: Replacing memory \S+ with list of registers\./.test(l) || /^(\S+: )?Warning: Replacing floating point parameter /.test(l)
    || l.includes('silinx_cs_prims.v');
  // (#650: a gate-level model's carry chains, registers and the logic between them at word level again; #659: its
  // irregular logic as tables)
  const json = bramInit(JSON.parse(text), v.top, v.instances);
  return { json: words && gateLevel(v.primitives) ? gateModel(json, v.top).json : json, top: v.top, warnings: [...v.warnings, ...lines.filter(l => /^Warning:/.test(l) && !quiet(l)).map(yosysWarning)] };
}

// a Yosys warning as Silinx says it (a latch: the signal's name, without Yosys's process and cell names)
function yosysWarning(l) {
  const m = /^Warning: Latch inferred for signal `\\[^.]*\.\\?([^']+)'/.exec(l);
  return m ? `latch inferred for '${m[1]}'` : l.replace(/^Warning:\s*/, '').replace(/`\\?([^']+)'/g, "'$1'");
}

/** The design compiled (run: Yosys; clock: the main clock's port, else found; wide: as compileNetlist's): a CompiledSim. */
export async function compileDesign(design, { run, clock = null, wide = false } = {}) {
  const { json, top, warnings } = await netlistOf(design, { run });
  const model = compileNetlist(json, { top, clock, wide });
  return Object.assign(new CompiledSim(model), { warnings: [...warnings, ...model.warnings] });
}

// ------------------------------------------------------------------ parameters, constants
const int = s => (typeof s === 'number' ? s : parseInt(String(s).replace(/[xz]/gi, '0'), 2));
// a parameter's bits, least significant first (x / z as 0)
const pbits = s => (typeof s === 'number' ? s.toString(2) : String(s)).split('').reverse().map(c => (c === '1' ? 1 : 0));
const bigOf = bits => { let v = 0n; for (let i = bits.length - 1; i >= 0; i--) v = (v << 1n) | BigInt(bits[i]); return v; };

// code of a value in a kind: 'n' (a number, unsigned, up to 32 bits) or 'b' (a BigInt)
const lit = (v, kind) => (kind === 'b' ? `${BigInt(v)}n` : String(Number(v)));
const mN = (e, w) => (w >= 32 ? `((${e}) >>> 0)` : `((${e}) & ${2 ** w - 1})`);
const sN = (e, w) => (w >= 32 ? `((${e}) | 0)` : `(((${e}) << ${32 - w}) >> ${32 - w})`);   // the signed value
const fix32 = (e, w) => (w >= 32 ? `((${e}) >>> 0)` : e);
const extN = (e, fw, tw, signed) => (tw === fw ? e : tw < fw ? mN(e, tw) : signed ? mN(sN(e, fw), tw) : e);
const mB = (e, w) => `BigInt.asUintN(${w}, ${e})`;
const sB = (e, w) => `BigInt.asIntN(${w}, ${e})`;
const extB = (e, fw, tw, signed) => (tw === fw ? e : tw < fw ? mB(e, tw) : signed ? mB(sB(e, fw), tw) : e);
const conv = (e, from, to) => (from === to ? e : to === 'b' ? `BigInt(${e})` : `Number(${e})`);

// the helpers the generated code calls (H)
const HELPERS = {
  par(x) { x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; x ^= x >>> 2; x ^= x >>> 1; return x & 1; },
  parB(x) { let p = 0; while (x) { p ^= Number(x & 1n); x >>= 1n; } return p; },
  dvT: (a, b) => (b === 0 ? 0 : Math.trunc(a / b)),
  mdT: (a, b) => (b === 0 ? 0 : a % b),
  dvF: (a, b) => (b === 0 ? 0 : Math.floor(a / b)),
  mdF(a, b) { if (b === 0) return 0; const r = a % b; return r !== 0 && (r < 0) !== (b < 0) ? r + b : r; },
  dvTB: (a, b) => (b === 0n ? 0n : a / b),
  mdTB: (a, b) => (b === 0n ? 0n : a % b),
  dvFB(a, b) { if (b === 0n) return 0n; const q = a / b; return (a % b !== 0n) && ((a < 0n) !== (b < 0n)) ? q - 1n : q; },
  mdFB(a, b) { if (b === 0n) return 0n; const r = a % b; return r !== 0n && (r < 0n) !== (b < 0n) ? r + b : r; },
  shN(a, s, w) { return s < 0 ? (-s >= w ? 0 : a << -s) : (s >= w ? 0 : a >>> s); },
  shB(a, s, w) { return s < 0n ? (-s >= BigInt(w) ? 0n : a << -s) : a >> s; },
};

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => a / gcd(a, b) * b;
const IGNORED = new Set(['$scopeinfo', '$print', '$check', '$assert', '$assume', '$cover', '$live', '$fair', '$specify2', '$specify3', '$specrule']);
const FF = new Set(['$dff', '$dffe', '$adff', '$adffe', '$sdff', '$sdffe', '$sdffce', '$aldff', '$aldffe', '$dffsr', '$dffsre', '$dlatch', '$adlatch']);
const COMB = new Set(['$not', '$pos', '$neg', '$and', '$or', '$xor', '$xnor', '$reduce_and', '$reduce_or', '$reduce_xor', '$reduce_xnor', '$reduce_bool',
  '$logic_not', '$logic_and', '$logic_or', '$eq', '$ne', '$eqx', '$nex', '$lt', '$le', '$gt', '$ge', '$add', '$sub', '$mul', '$div', '$mod', '$divfloor', '$modfloor',
  '$shl', '$sshl', '$shr', '$sshr', '$shift', '$shiftx', '$mux', '$pmux', '$bmux', '$demux', '$bwmux', '$lut']);
const UNARY = new Set(['$not', '$pos', '$neg', '$reduce_and', '$reduce_or', '$reduce_xor', '$reduce_xnor', '$reduce_bool', '$logic_not']);
const SHIFTS = new Set(['$shl', '$sshl', '$shr', '$sshr', '$shift', '$shiftx']);
const CMP = { $eq: '===', $ne: '!==', $eqx: '===', $nex: '!==', $lt: '<', $le: '<=', $gt: '>', $ge: '>=' };
const SETTLE_LIMIT = 10000;
const PROFILE = 20000;   // the cycles of the activity's profile (compileNetlist)
const GUARD = 2;         // a segment's guard, as cells
const PMAX = 0.3;        // a segment more often evaluated: unguarded
const WORTH = 0.5;       // the guards, when they leave at most this part of the cells evaluated per step
const OPS = 4;           // (#670) a cell's operations, as cells (compileNetlist's weightOf)
const CUT_GAIN = 0.25;   // (#670) a cut changing more often than this part of what it reads: no cut
const DETECT = 1.5;      // (#670) a cut's test of its changes, as cells
const SPLIT = 80000;     // the characters of code above which run() is split (#629: compileNetlist)
const CHUNK = 40000;     // the characters of a function of its combinational code, at most
const PIECE = 10000;     // the cycles of a call of run() at most (#650: CompiledSim.cycle)

// Statements (strings) in consecutive groups of `max` characters at most (a longer one alone), joined by lines.
export function chunks(list, max) {
  const out = [];
  let cur = [], len = 0;
  for (const x of list) {
    if (cur.length && len + x.length + 1 > max) { out.push(cur.join('\n')); cur = []; len = 0; }
    cur.push(x); len += x.length + 1;
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

// The segments of the blocks (compileNetlist's activity): consecutive blocks evaluated together when a value
// one of them reads changed, chosen to evaluate the fewest cells per cycle, guards counted (dynamic
// programming): a segment of C cells costs GUARD + p * C, p the chance one of its values changed (the sum of
// their rates, up to 1), or C unguarded (when it reads a value that changes at every step, or p is high).
// blocks: [{ cells, keys, always, weight }] in order (weight: the block's cost as cells, #670; else its cells); rate:
// Map(key -> changes per evaluation). The segments, with their cost: the cells evaluated per step, guards counted.
export function segmentsOf(blocks, rate, maxLen = 400) {
  const m = blocks.length, best = new Float64Array(m + 1), from = new Int32Array(m + 1), guarded = new Uint8Array(m + 1);
  for (let j = 1; j <= m; j++) {
    best[j] = Infinity;
    const keys = new Set();
    let C = 0, p = 0, always = false;
    for (let i = j; i >= 1 && j - i < maxLen; i--) {
      const b = blocks[i - 1];
      C += b.weight ?? b.cells.length;
      always ||= b.always;
      for (const k of b.keys) if (!keys.has(k)) { keys.add(k); p += rate.get(k) || 0; }
      const g = always || p > PMAX ? Infinity : GUARD + p * C;
      const cost = best[i - 1] + Math.min(C, g);
      if (cost < best[j]) { best[j] = cost; from[j] = i - 1; guarded[j] = g < C ? 1 : 0; }
    }
  }
  const segs = [];
  for (let j = m; j > 0; j = from[j]) {
    const bl = blocks.slice(from[j], j);
    // (two unguarded segments side by side: one)
    if (!guarded[j] && segs.length && !segs[0].keys) segs[0].blocks.unshift(...bl);
    else segs.unshift({ blocks: bl, keys: guarded[j] ? new Set(bl.flatMap(b => b.keys)) : null });
  }
  segs.cost = best[m];
  return segs;
}

// (#670) The blocks in an order their dependencies keep, those evaluated at most steps (reading a value that changes
// at every step, or more often than PMAX) together, the others together, so that segmentsOf finds long segments
// of either kind: the blocks ready, the next of the same kind as the last first, else the first in their order.
export function clustered(blocks, rate) {
  const hot = b => b.always || b.keys.reduce((p, k) => p + (rate.get(k) || 0), 0) > PMAX;
  const index = new Map(blocks.map((b, i) => [b, i])), users = new Map(blocks.map(b => [b, []])), left = new Map();
  for (const b of blocks) {
    const deps = [...(b.deps || [])].filter(d => index.has(d));
    left.set(b, deps.length);
    deps.forEach(d => users.get(d).push(b));
  }
  const ready = blocks.filter(b => !left.get(b)), out = [];
  let last = null;
  while (ready.length) {
    let k = ready.findIndex(b => hot(b) === last);
    if (k < 0) k = 0;
    const b = ready.splice(k, 1)[0];
    out.push(b);
    last = hot(b);
    for (const u of users.get(b)) if (left.set(u, left.get(u) - 1).get(u) === 0) {
      // (kept in their first order)
      const i = ready.findIndex(r => index.get(r) > index.get(u));
      ready.splice(i < 0 ? ready.length : i, 0, u);
    }
  }
  return out;
}

// ------------------------------------------------------------------ a VGA monitor (watch.vga)
// The picture as a monitor finds it in the sync signals, each cycle: a line from each leading edge of HSYNC
// (its active level: the shorter one, low until both are measured), the pixel clock from the line's period
// (VGA_TOTAL_W pixels a line), the column from the time since that edge (the active picture VGA_BEFORE_X pixels
// after it: the sync pulse and the back porch), the row from the time since the leading edge of VSYNC in lines
// (VGA_BEFORE_Y lines of sync and back porch), whether VSYNC changes at the start of a line or with HSYNC. FB:
// the rgb bits' value of each pixel of the VGA_W x VGA_H picture; VG (VGA_STATE): the monitor's state, its
// measures in cycles.
export const VGA_W = 640, VGA_H = 480, VGA_TOTAL_W = 800, VGA_BEFORE_X = 144, VGA_BEFORE_Y = 35;
/** The monitor's state (core/vga.js reads it): the cycle, the HSYNC / VSYNC levels and edges, the measures. */
export const VGA_STATE = ['ct', 'hp', 'hr', 'hf', 'hhi', 'hlo', 'lead', 'L', 'kx', 'row', 'vp', 'vr', 'vf', 'vhi', 'vlo', 'vlead', 'frames', 'fp', 'hsw', 'vsw'];
const VGA_CODE = (hs, vs, rgb) => `{
  const hs = ${hs}, vs = ${vs};
  // (the first cycle: the levels, no edge)
  if (g_vp < 0) { g_vp = vs; g_hp = hs; }
  if (vs !== g_vp) {
    if (vs) { if (g_vf >= 0) g_vlo = g_ct - g_vf; g_vr = g_ct; } else { if (g_vr >= 0) g_vhi = g_ct - g_vr; g_vf = g_ct; }
    const low = !(g_vhi > 0 && g_vlo > 0 && g_vhi < g_vlo);
    if (vs === (low ? 0 : 1)) { if (g_vlead >= 0) { g_fp = g_ct - g_vlead; g_frames++; } g_vlead = g_ct; }
    else if (g_vlead >= 0 && g_L > 0) g_vsw = (g_ct - g_vlead) / g_L;
    g_vp = vs;
  }
  if (hs !== g_hp) {
    if (hs) { if (g_hf >= 0) g_hlo = g_ct - g_hf; g_hr = g_ct; } else { if (g_hr >= 0) g_hhi = g_ct - g_hr; g_hf = g_ct; }
    const low = !(g_hhi > 0 && g_hlo > 0 && g_hhi < g_hlo);
    if (hs === (low ? 0 : 1)) {
      if (g_lead >= 0) { g_L = g_ct - g_lead; g_kx = ${VGA_TOTAL_W} / g_L; }
      g_lead = g_ct;
      g_row = g_vlead >= 0 && g_L > 0 ? Math.floor((g_ct - g_vlead) / g_L) + 1 - ${VGA_BEFORE_Y} : -1;
    } else if (g_lead >= 0) g_hsw = g_ct - g_lead;
    g_hp = hs;
  }
  if (g_row >= 0 && g_row < ${VGA_H} && g_L > 0) {
    const x = ((g_ct - g_lead) * g_kx | 0) - ${VGA_BEFORE_X};
    if (x >= 0 && x < ${VGA_W}) FB[g_row * ${VGA_W} + x] = ${rgb};
  }
  g_ct++;
}`;

/** The netlist's bit for bit `pos` (0: the least significant) of the port `name` of module `top`, for watch. */
export function portBit(json, top, name, pos = 0) {
  const bits = json.modules[top]?.ports?.[name]?.bits;
  if (!bits || pos >= bits.length) throw new Error(`no port '${name}'${bits ? ` bit ${pos}` : ''}`);
  return bits[pos];
}

/**
 * Compile a word-level netlist (Yosys's JSON after prepCommands) into a model for CompiledSim:
 * { code, inputs: [{ name, v, w, kind }], ports, nets: Map(name -> bits), src: Map(bit -> [var, off]),
 *   vars: [{ w, kind }], warnings: [messages], clock: { port } | null, stats }.
 * o: { top, clock: the main clock's port name (null: the input that clocks the most flip-flops; false: none,
 *      every clock then settled as the other clocks are: a clock on a button), wide: every value a BigInt
 *      (to test that code), watch: what each cycle counts (CompiledSim.take), activity: the combinational
 *      cells evaluated only when what they read changed (#464; false: all of them every step; 'fine', 'max':
 *      the most guards, the fewest, to test that code), profile: the cycles run to choose the guards, split / chunk:
 *      the code's characters above which run() is split, and its functions' at most (#629: SPLIT, CHUNK) }
 * watch: { levels: [{ bit, on }] (the cycles a bit is at `on`), pairs: [[{ bit, on }, { bit, on }]] (the cycles
 *   both are), edges: [{ bit, capture: [bits] }] (each falling edge of the bit: the cycle and the captured
 *   bits' value, up to 32), vga: { hs, vs, rgb: [bits] } (a VGA monitor: VGA_CODE) }, the bits as in the
 *   netlist (portBit), sampled in every cycle before its clock edge (the values the cycle shows).
 */
export function compileNetlist(json, { top, clock = null, wide = false, watch = null, activity = true, profile = PROFILE, split: splitAt = SPLIT, chunk = CHUNK } = {}) {
  const mod = json.modules[top] || Object.values(json.modules).find(m => m.attributes?.top) || Object.values(json.modules)[0];
  if (!mod) throw new CompileError('the netlist has no module');
  const vars = [];                 // { w, kind }
  const src = new Map();           // bit -> [var, offset]
  const newVar = (w) => { vars.push({ w, kind: wide || w > 32 ? 'b' : 'n' }); return vars.length - 1; };
  const drive = (bits, v) => bits.forEach((b, i) => { if (typeof b === 'number') src.set(b, [v, i]); });
  const names = [];                // cell names for the messages
  const cellName = (n) => n.replace(/^\$[^$]*\$/, '').replace(/\$\d+$/, '');

  // ---- ports
  const inputs = [], ports = [];
  for (const [name, p] of Object.entries(mod.ports || {})) {
    if (p.direction === 'inout') throw new CompileError(`the inout port '${name}' (a tristate) cannot be compiled`);
    ports.push({ name, dir: p.direction, bits: p.bits });
    if (p.direction === 'input') {
      const v = newVar(p.bits.length);
      drive(p.bits, v);
      inputs.push({ name, v, w: p.bits.length, kind: vars[v].kind, bits: p.bits });
    }
  }
  // ---- initial values (the init attributes of the wires)
  const init = new Map();
  for (const n of Object.values(mod.netnames || {})) {
    const iv = n.attributes?.init;
    if (iv == null) continue;
    const b = pbits(iv);
    n.bits.forEach((bit, i) => { if (typeof bit === 'number' && b[i]) init.set(bit, 1); });
  }

  // ---- cells: outputs as variables
  const comb = [], elems = [], mems = [], dcms = [];
  for (const [cname, c] of Object.entries(mod.cells || {})) {
    const t = c.type, P = c.parameters || {}, C = c.connections || {};
    if (IGNORED.has(t)) continue;
    names.push(cname);
    if (COMB.has(t)) {
      const v = newVar(C.Y.length);
      drive(C.Y, v);
      comb.push({ name: cname, type: t, P, C, y: v });
    } else if (FF.has(t)) {
      const v = newVar(C.Q.length);
      drive(C.Q, v);
      elems.push({ name: cname, type: t, P, C, q: v, init: bigOf(C.Q.map(b => init.get(b) || 0)) });
    } else if (t === '$mem_v2') {
      mems.push({ name: cname, P, C });
    } else if (DCM_CELLS.has(t)) {
      // a DCM: its outputs are variables the clock schedule sets (below)
      const outs = {};
      for (const port of DCM_OUTPUTS) {
        if (!C[port]?.length) continue;
        outs[port] = newVar(C[port].length);
        drive(C[port], outs[port]);
      }
      dcms.push({ name: cname, P, C, outs });
    } else if (t === '$tribuf' || t === '$_TBUF_') {
      throw new CompileError(`the tristate buffer '${cellName(cname)}' cannot be compiled`);
    } else {
      throw new CompileError(`the cell '${cellName(cname)}' (${t}) has no compiled model`);
    }
  }
  // memories: the read ports' data (asynchronous ports: combinational; synchronous: registers)
  for (const [k, m] of mems.entries()) {
    const P = m.P, C = m.C;
    const width = int(P.WIDTH), size = int(P.SIZE), abits = int(P.ABITS), offset = int(P.OFFSET);
    const nr = int(P.RD_PORTS), nw = int(P.WR_PORTS);
    if (pbits(P.RD_WIDE_CONTINUATION).some(Boolean) || pbits(P.WR_WIDE_CONTINUATION).some(Boolean))
      throw new CompileError(`the memory '${cellName(m.name)}' has wide ports: not compiled yet`);
    const wrClk = pbits(P.WR_CLK_ENABLE);
    for (let j = 0; j < nw; j++) if (!wrClk[j]) throw new CompileError(`the memory '${cellName(m.name)}' has an asynchronous write port: not compiled`);
    Object.assign(m, { k, width, size, abits, offset, nr, nw, kind: wide || width > 32 ? 'b' : 'n' });
    const rdClk = pbits(P.RD_CLK_ENABLE), rdPol = pbits(P.RD_CLK_POLARITY);
    const ce = pbits(P.RD_CE_OVER_SRST), tm = pbits(P.RD_TRANSPARENCY_MASK);
    const rinit = pbits(P.RD_INIT_VALUE), rarst = pbits(P.RD_ARST_VALUE), rsrst = pbits(P.RD_SRST_VALUE);
    for (let i = 0; i < nr; i++) {
      const data = C.RD_DATA.slice(i * width, (i + 1) * width), addr = C.RD_ADDR.slice(i * abits, (i + 1) * abits);
      const v = newVar(width);
      drive(data, v);
      const word = bits => bigOf(bits.slice(i * width, (i + 1) * width));
      if (!rdClk[i]) comb.push({ name: m.name, type: '$memrd', mem: m, addr, y: v });
      else {
        elems.push({ name: m.name, type: '$memrd', mem: m, port: i, addr, q: v, init: word(rinit),
          C: { CLK: [C.RD_CLK[i]], EN: [C.RD_EN[i]], ARST: [C.RD_ARST[i]], SRST: [C.RD_SRST[i]] },
          P: { CLK_POLARITY: String(rdPol[i]) }, arst: word(rarst), srst: word(rsrst), ceOverSrst: !!ce[i],
          transparent: Array.from({ length: nw }, (_, j) => !!tm[i * nw + j]) });
      }
    }
    const wrPol = pbits(P.WR_CLK_POLARITY);
    m.writes = [];
    for (let j = 0; j < nw; j++) {
      const w = { name: m.name, type: '$memwr', mem: m, port: j, C: { CLK: [C.WR_CLK[j]] }, P: { CLK_POLARITY: String(wrPol[j]) },
        addr: C.WR_ADDR.slice(j * abits, (j + 1) * abits), data: C.WR_DATA.slice(j * width, (j + 1) * width), en: C.WR_EN.slice(j * width, (j + 1) * width) };
      m.writes.push(w);
      elems.push(w);
    }
  }
  elems.forEach((e, i) => { e.id = i; });

  // ---- expressions: a list of bits as a value of a kind
  function sig(bits, kind) {
    const w = bits.length;
    if (!w) return lit(0, kind);
    const runs = [];   // { v, off, len, pos } | { c: bits, pos, len }
    bits.forEach((b, i) => {
      const s = typeof b === 'number' ? src.get(b) : null;
      const last = runs[runs.length - 1];
      if (!s) {
        const bit = b === '1' ? 1 : 0;   // '0', 'x', 'z', an undriven bit: 0
        if (last && last.c) { last.c.push(bit); last.len++; } else runs.push({ c: [bit], pos: i, len: 1 });
      } else if (last && last.v === s[0] && !last.rep && last.off + last.len === s[1]) last.len++;
      else if (last && last.v === s[0] && last.off === s[1] && (last.rep || last.len === 1)) { last.rep = true; last.len++; }
      else runs.push({ v: s[0], off: s[1], len: 1, pos: i });
    });
    const parts = [];
    let cst = 0n, shifted = false;
    for (const r of runs) {
      if (r.c) { cst |= bigOf(r.c) << BigInt(r.pos); continue; }
      const vk = vars[r.v].kind, vw = vars[r.v].w, name = `v${r.v}`, len = r.rep ? 1 : r.len;
      let e;
      if (vk === 'n') {
        e = r.off ? `(${name} >>> ${r.off})` : name;
        if (r.off + len < vw) e = mN(e, len);
        if (kind === 'b') e = `BigInt(${e})`;
      } else {
        e = r.off ? `(${name} >> ${r.off}n)` : name;
        if (r.off + len < vw) e = `(${e} & ${(1n << BigInt(len)) - 1n}n)`;
        if (kind === 'n') e = `Number(${e})`;
      }
      // (a bit repeated, as a sign extension: 0 or all ones)
      if (r.rep) e = kind === 'b' ? `(-${e} & ${(1n << BigInt(r.len)) - 1n}n)` : `(-${e} & ${2 ** r.len - 1})`;
      if (r.pos) { e = kind === 'b' ? `(${e} << ${r.pos}n)` : `(${e} << ${r.pos})`; shifted = true; }
      parts.push(e);
    }
    if (cst) parts.push(lit(cst, kind));
    if (!parts.length) return lit(0, kind);
    const e = parts.length === 1 ? parts[0] : `(${parts.join(' | ')})`;
    // (a 32-bit value put together with | or << is a signed int32: made unsigned)
    return kind === 'n' && w >= 32 && (parts.length > 1 || shifted) ? `(${e} >>> 0)` : e;
  }

  const warnings = [];
  if ([...comb, ...elems].some(n => Object.values(n.C || {}).some(bits => bits.includes('z')))) warnings.push("a high-impedance value ('Z') is 0 in the compiled simulator");

  // ---- the combinational cells, in topological order
  const combOf = new Map();   // var -> comb node
  comb.forEach(n => combOf.set(n.y, n));
  const inBits = n => (n.type === '$memrd' ? n.addr : Object.entries(n.C).filter(([p]) => p !== 'Y').flatMap(([, b]) => b));
  const order = [], state = new Map();   // 1 visiting, 2 done
  for (const n of comb) {
    if (state.get(n)) continue;
    const stack = [[n, 0, inBits(n)]];
    state.set(n, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [node, i, bits] = top;
      if (i >= bits.length) { state.set(node, 2); order.push(node); stack.pop(); continue; }
      top[1]++;
      const b = bits[i];
      const s = typeof b === 'number' ? src.get(b) : null;
      const dep = s ? combOf.get(s[0]) : null;
      if (!dep || state.get(dep) === 2) continue;
      if (state.get(dep) === 1) {
        const net = Object.entries(mod.netnames || {}).find(([nm, nn]) => !nn.hide_name && nn.bits.includes(b))?.[0];
        throw new CompileError(`combinational loop${net ? ` through '${net}'` : ` through the cell '${cellName(dep.name)}'`}: not compiled`);
      }
      state.set(dep, 1);
      stack.push([dep, 0, inBits(dep)]);
    }
  }

  // a memory's word at an address (0 outside it; an address that cannot leave it needs no test)
  const rdExpr = (m, addr, kind) => {
    const e = `m${m.k}[${sig(addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}]`;
    return !m.offset && 2 ** addr.length <= m.size ? e : `(${e} ?? ${lit(0, kind)})`;
  };
  // a combinational cell's value (n.kind: the kind it is computed in)
  function cellExpr(n) {
    const t = n.type, P = n.P, C = n.C;
    if (t === '$memrd') {
      const m = n.mem;
      n.kind = m.kind;
      return rdExpr(m, n.addr, m.kind);
    }
    const yw = C.Y.length;
    if (t === '$mux' || t === '$pmux' || t === '$bwmux') {
      const K = n.kind = wide || yw > 32 ? 'b' : 'n';
      if (t === '$mux') return `(${sig(C.S, 'n')} ? ${sig(C.B, K)} : ${sig(C.A, K)})`;
      if (t === '$bwmux') {
        const s = sig(C.S, K);
        return K === 'b' ? `((${sig(C.A, K)} & ~${s} & ${(1n << BigInt(yw)) - 1n}n) | (${sig(C.B, K)} & ${s}))` : fix32(`((${sig(C.A, K)} & ~${s}) | (${sig(C.B, K)} & ${s}))`, yw);
      }
      const sw = C.S.length;
      let e = sig(C.A, K);
      for (let i = sw - 1; i >= 0; i--) e = `(${sig([C.S[i]], 'n')} ? ${sig(C.B.slice(i * yw, (i + 1) * yw), K)} : ${e})`;
      return e;
    }
    if (t === '$bmux') {
      const w = yw, sw = C.S.length, total = w << sw;
      const s = sig(C.S, 'n');
      if (!wide && total <= 32) { n.kind = 'n'; return mN(`(${sig(C.A, 'n')} >>> (${s} * ${w}))`, w); }
      n.kind = 'b';
      return mB(`(${sig(C.A, 'b')} >> BigInt(${s} * ${w}))`, w);
    }
    if (t === '$demux') {
      const w = C.A.length, s = sig(C.S, 'n');
      if (!wide && yw <= 32) { n.kind = 'n'; return fix32(`(${sig(C.A, 'n')} << (${s} * ${w}))`, yw); }
      n.kind = 'b';
      return `(${sig(C.A, 'b')} << BigInt(${s} * ${w}))`;
    }
    if (t === '$lut') {
      const w = int(P.WIDTH), L = bigOf(pbits(P.LUT).slice(0, 1 << w));
      if (!wide && (1 << w) <= 32) { n.kind = 'n'; return `((${Number(L)} >>> ${sig(C.A, 'n')}) & 1)`; }
      n.kind = 'b';
      return `((${L}n >> BigInt(${sig(C.A, 'n')})) & 1n)`;
    }
    const aw = C.A.length, bw = C.B ? C.B.length : 0;
    const as = int(P.A_SIGNED ?? 0) === 1, bs = int(P.B_SIGNED ?? 0) === 1;
    const sg = UNARY.has(t) ? as : as && bs;
    const isShift = SHIFTS.has(t);
    let ww = Math.max(aw, yw, isShift ? 0 : bw);
    if (t === '$div' || t === '$mod' || t === '$divfloor' || t === '$modfloor') ww = Math.max(aw, bw, yw);
    const K = n.kind = wide || ww > 32 || bw > 32 ? 'b' : 'n';
    const a = sig(C.A, K), b = C.B ? sig(C.B, K) : null;
    const N = K === 'n';
    const m = N ? mN : mB, ext = N ? extN : extB, sv = N ? sN : sB;
    const one = lit(1, K), zero = lit(0, K);
    const bool = e => `(${e} ? ${one} : ${zero})`;
    const ones = w => lit((1n << BigInt(w)) - 1n, K);
    switch (t) {
      case '$not': return m(`~${ext(a, aw, yw, as)}`, yw);
      case '$pos': return ext(a, aw, yw, as);
      case '$neg': return m(`-${ext(a, aw, yw, as)}`, yw);
      case '$and': return N ? fix32(`(${ext(a, aw, yw, sg)} & ${ext(b, bw, yw, sg)})`, yw) : `(${ext(a, aw, yw, sg)} & ${ext(b, bw, yw, sg)})`;
      case '$or': return N ? fix32(`(${ext(a, aw, yw, sg)} | ${ext(b, bw, yw, sg)})`, yw) : `(${ext(a, aw, yw, sg)} | ${ext(b, bw, yw, sg)})`;
      case '$xor': return N ? fix32(`(${ext(a, aw, yw, sg)} ^ ${ext(b, bw, yw, sg)})`, yw) : `(${ext(a, aw, yw, sg)} ^ ${ext(b, bw, yw, sg)})`;
      case '$xnor': return m(`~(${ext(a, aw, yw, sg)} ^ ${ext(b, bw, yw, sg)})`, yw);
      case '$reduce_and': return bool(`${a} === ${ones(aw)}`);
      case '$reduce_or': case '$reduce_bool': return bool(`${a} !== ${zero}`);
      case '$reduce_xor': return N ? `H.par(${a})` : `BigInt(H.parB(${a}))`;
      case '$reduce_xnor': return N ? `(H.par(${a}) ^ 1)` : `BigInt(H.parB(${a}) ^ 1)`;
      case '$logic_not': return bool(`${a} === ${zero}`);
      case '$logic_and': return bool(`${a} !== ${zero} && ${b} !== ${zero}`);
      case '$logic_or': return bool(`${a} !== ${zero} || ${b} !== ${zero}`);
      case '$eq': case '$ne': case '$eqx': case '$nex': case '$lt': case '$le': case '$gt': case '$ge':
        return bool(sg ? `${sv(a, aw)} ${CMP[t]} ${sv(b, bw)}` : `${a} ${CMP[t]} ${b}`);
      case '$add': return m(`${ext(a, aw, yw, sg)} + ${ext(b, bw, yw, sg)}`, yw);
      case '$sub': return m(`${ext(a, aw, yw, sg)} - ${ext(b, bw, yw, sg)}`, yw);
      case '$mul': return N ? m(`Math.imul(${ext(a, aw, yw, sg)}, ${ext(b, bw, yw, sg)})`, yw) : m(`${ext(a, aw, yw, sg)} * ${ext(b, bw, yw, sg)}`, yw);
      case '$div': case '$mod': case '$divfloor': case '$modfloor': {
        const fn = { $div: 'dvT', $mod: 'mdT', $divfloor: 'dvF', $modfloor: 'mdF' }[t] + (N ? '' : 'B');
        return m(`H.${fn}(${sg ? sv(a, aw) : a}, ${sg ? sv(b, bw) : b})`, yw);
      }
      case '$shl': case '$sshl':
        return N ? `(${b} >= ${yw} ? 0 : ${m(`${ext(a, aw, yw, as)} << ${b}`, yw)})` : `(${b} >= ${yw}n ? 0n : ${m(`${ext(a, aw, yw, as)} << ${b}`, yw)})`;
      case '$shr': case '$sshr': {
        const sw = Math.max(aw, yw);
        if (t === '$sshr' && as) return N ? m(`${sN(a, aw)} >> (${b} > 31 ? 31 : ${b})`, yw) : m(`${sB(a, aw)} >> ${b}`, yw);
        return N ? `(${b} >= ${sw} ? 0 : ${m(`${ext(a, aw, sw, as)} >>> ${b}`, yw)})` : m(`${ext(a, aw, sw, as)} >> ${b}`, yw);
      }
      case '$shift': case '$shiftx': {
        // (#629: a constant shifted by an unsigned amount of 5 bits at most, a LUT's INIT read at its inputs: no
        // helper; the bits shifted in are 0, the constant being of aw bits at most)
        if (N && aw <= 32 && bw <= 5 && !bs && C.A.every(x => x === '0' || x === '1')) return m(`(${a} >>> ${b})`, yw);
        const sw = Math.max(aw, yw);
        const av = ext(a, aw, sw, t === '$shift' && as);
        const s = bs ? sv(b, bw) : b;
        return N ? m(`H.shN(${av}, ${s}, ${sw})`, yw) : m(`H.shB(${av}, ${s}, ${sw})`, yw);
      }
    }
    throw new CompileError(`the cell '${cellName(n.name)}' (${t}) has no compiled model`);
  }

  // ---- the clocked and asynchronous elements
  // (each clocked one: sample, from the values before the edge, into n<id>; then commit)
  const vk = e => vars[e.q].kind;
  const cst = (bits, kind) => lit(bigOf(bits), kind);
  const pol = (e, p) => int(e.P[p] ?? 1);
  const act = (e, port, p) => `${sig(e.C[port], 'n')} === ${pol(e, p)}`;
  // a vector of per-bit active signals (SET / CLR of $dffsr) as a mask
  const actMask = (e, port, p, w, kind) => {
    const s = sig(e.C[port], kind);
    if (pol(e, p)) return s;
    return kind === 'b' ? `(~${s} & ${(1n << BigInt(w)) - 1n}n)` : mN(`~${s}`, w);
  };
  function sample(e) {
    const q = `v${e.q}`, nn = `n${e.id}`;
    if (e.type === '$memwr') {
      const m = e.mem;
      return `a${e.id} = ${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}; ${nn} = ${sig(e.data, m.kind)}; w${e.id} = ${sig(e.en, m.kind)};`;
    }
    const kind = vk(e), w = vars[e.q].w;
    const d = () => sig(e.C.D, kind);
    const en = () => act(e, 'EN', 'EN_POLARITY');
    const val = p => cst(pbits(e.P[p]).slice(0, w), kind);
    let x;
    switch (e.type) {
      case '$dff': x = d(); break;
      case '$dffe': x = `(${en()} ? ${d()} : ${q})`; break;
      case '$adff': x = `(${act(e, 'ARST', 'ARST_POLARITY')} ? ${val('ARST_VALUE')} : ${d()})`; break;
      case '$adffe': x = `(${act(e, 'ARST', 'ARST_POLARITY')} ? ${val('ARST_VALUE')} : ${en()} ? ${d()} : ${q})`; break;
      case '$sdff': x = `(${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${d()})`; break;
      case '$sdffe': x = `(${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${en()} ? ${d()} : ${q})`; break;
      case '$sdffce': x = `(${en()} ? (${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${d()}) : ${q})`; break;
      case '$aldff': x = `(${act(e, 'ALOAD', 'ALOAD_POLARITY')} ? ${sig(e.C.AD, kind)} : ${d()})`; break;
      case '$aldffe': x = `(${act(e, 'ALOAD', 'ALOAD_POLARITY')} ? ${sig(e.C.AD, kind)} : ${en()} ? ${d()} : ${q})`; break;
      case '$dffsr': case '$dffsre': {
        const base = e.type === '$dffsre' ? `(${en()} ? ${d()} : ${q})` : d();
        const set = actMask(e, 'SET', 'SET_POLARITY', w, kind), clr = actMask(e, 'CLR', 'CLR_POLARITY', w, kind);
        x = kind === 'b' ? `((${base} | ${set}) & ~${clr})` : fix32(`((${base} | ${set}) & ~${clr})`, w);
        break;
      }
      case '$memrd': {
        const m = e.mem;
        let rd = rdExpr(m, e.addr, kind);
        // a transparent port reads what a write port of the same edge writes at its address
        e.transparent.forEach((tr, j) => {
          if (!tr) return;
          const wr = m.writes[j];
          const wa = `${sig(wr.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}`, wd = sig(wr.data, kind), we = sig(wr.en, kind);
          const merged = kind === 'b' ? `((r & ~we) | (${wd} & we))` : `(((r & ~we) | (${wd} & we)) >>> 0)`;
          rd = `((r, we) => (${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}) === (${wa}) ? ${kind === 'b' ? mB(merged, w) : merged} : r)(${rd}, ${we})`;
        });
        const en1 = `${sig(e.C.EN, 'n')} === 1`, srst = `${sig(e.C.SRST, 'n')} === 1`;
        const srstV = lit(e.srst, kind), arstV = lit(e.arst, kind);
        x = e.ceOverSrst ? `(${en1} ? (${srst} ? ${srstV} : ${rd}) : ${q})` : `(${srst} ? ${srstV} : ${en1} ? ${rd} : ${q})`;
        x = `(${sig(e.C.ARST, 'n')} === 1 ? ${arstV} : ${x})`;
        break;
      }
      default: return '';   // latches: asynchronous only
    }
    return `${nn} = ${x};`;
  }
  // (flag: a memory write on the main clock, its dirty bit set (@@set m<memory>@@, as generate writes it))
  function commit(e, flag = false) {
    if (e.type === '$memwr') {
      const m = e.mem, k = `m${m.k}`, a = `a${e.id}`, we = `w${e.id}`;
      const zero = lit(0, m.kind);
      const merged = m.kind === 'b' ? `(${k}[${a}] & ~${we}) | (n${e.id} & ${we})` : `(${k}[${a}] & ~${we}) | (n${e.id} & ${we})`;
      return `if (${we} !== ${zero} && ${a} >= 0 && ${a} < ${m.size}) ${flag ? `{ ${k}[${a}] = ${merged}; @@set m${m.k}@@ }` : `${k}[${a}] = ${merged};`}`;
    }
    if (e.type === '$dlatch' || e.type === '$adlatch') return '';
    return `v${e.q} = n${e.id};`;
  }
  // the asynchronous part of an element: brings it to its value now; ch = true when it changed
  function async(e) {
    const q = `v${e.q}`;
    const kind = e.q != null ? vk(e) : null, w = e.q != null ? vars[e.q].w : 0;
    const val = p => cst(pbits(e.P[p]).slice(0, w), kind);
    const set = (cond, v) => `if (${cond} && ${q} !== ${v}) { ${q} = ${v}; ch = true; }`;
    switch (e.type) {
      case '$adff': case '$adffe': return set(act(e, 'ARST', 'ARST_POLARITY'), val('ARST_VALUE'));
      case '$aldff': case '$aldffe': return `{ const t = ${sig(e.C.AD, kind)}; ${set(act(e, 'ALOAD', 'ALOAD_POLARITY'), 't')} }`;
      case '$dffsr': case '$dffsre': {
        const s = actMask(e, 'SET', 'SET_POLARITY', w, kind), c = actMask(e, 'CLR', 'CLR_POLARITY', w, kind);
        const t = kind === 'b' ? `((${q} | ${s}) & ~${c})` : fix32(`((${q} | ${s}) & ~${c})`, w);
        return `{ const t = ${t}; if (t !== ${q}) { ${q} = t; ch = true; } }`;
      }
      case '$dlatch': return `{ const t = ${sig(e.C.D, kind)}; ${set(act(e, 'EN', 'EN_POLARITY'), 't')} }`;
      case '$adlatch': return `if (${act(e, 'ARST', 'ARST_POLARITY')}) { ${set('true', val('ARST_VALUE'))} } else { const t = ${sig(e.C.D, kind)}; ${set(act(e, 'EN', 'EN_POLARITY'), 't')} }`;
      case '$memrd': return set(`${sig(e.C.ARST, 'n')} === 1`, lit(e.arst, kind));
    }
    return '';
  }

  // ---- clock domains: the main clock (an input port bit), the other clocks (edges found when settling)
  const clocked = elems.filter(e => e.type !== '$dlatch' && e.type !== '$adlatch');
  const clkBit = e => e.C.CLK[0];
  let main = null;
  // (a DCM: the input clocking it is the main clock)
  const dcmOf = new Map();   // a DCM output's bit -> [dcm, port]
  for (const d of dcms) for (const [port, v] of Object.entries(d.outs)) d.C[port].forEach(b => dcmOf.set(b, [d, port]));
  const roots = dcms.filter(d => !dcmOf.has(d.C.CLKIN?.[0]));
  if (dcms.length && !roots.length) throw new CompileError(`the DCM '${cellName(dcms[0].name)}' is in a loop of DCMs: not compiled`);
  for (const d of roots) {
    const b = d.C.CLKIN?.[0];
    if (typeof b !== 'number' || !inputs.some(i => i.bits.includes(b))) throw new CompileError(`the DCM '${cellName(d.name)}' is not clocked by an input port: not compiled`);
  }
  const dcmClock = roots[0]?.C.CLKIN[0];
  if (roots.some(d => d.C.CLKIN[0] !== dcmClock)) throw new CompileError('DCMs clocked by two input ports: not compiled');
  const portOfBit = b => inputs.find(i => i.bits.includes(b))?.name;
  if (dcms.length && (clock === false || (clock && portOfBit(dcmClock) !== clock))) {
    throw new CompileError(`the DCM '${cellName(roots[0].name)}' is clocked by '${portOfBit(dcmClock)}', ${clock ? `not by the main clock '${clock}'` : 'with no main clock'}: not compiled`);
  }
  if (dcms.length) main = dcmClock;
  else if (clock === false) main = null;
  else if (clock) {
    const p = inputs.find(i => i.name === clock);
    if (!p) throw new CompileError(`the clock '${clock}' is not an input port`);
    main = p.bits[0];
  } else {
    // (the input that clocks the most register bits; of two, the one named clk…)
    const count = new Map();
    for (const e of clocked) {
      const b = clkBit(e);
      if (typeof b === 'number' && inputs.some(i => i.bits.includes(b))) count.set(b, (count.get(b) || 0) + (e.q != null ? vars[e.q].w : 1));
    }
    const named = b => (/^(clk|clock|mclk)/i.test(inputs.find(i => i.bits.includes(b)).name) ? 1 : 0);
    main = [...count].sort((x, y) => y[1] - x[1] || named(y[0]) - named(x[0]))[0]?.[0] ?? null;
  }
  const mainPort = main == null ? null : inputs.find(i => i.bits.includes(main));
  const onMain = clocked.filter(e => clkBit(e) === main);
  const posMain = onMain.filter(e => pol(e, 'CLK_POLARITY') === 1), negMain = onMain.filter(e => pol(e, 'CLK_POLARITY') !== 1);
  const derived = new Map();   // clock bit -> elements
  for (const e of clocked) {
    const b = clkBit(e);
    if (b === main || typeof b !== 'number') continue;   // a constant clock never ticks
    if (!derived.has(b)) derived.set(b, []);
    derived.get(b).push(e);
  }
  // the main clock read by logic (not only by clock pins): its value matters, both edges are steps
  const usesMain = comb.some(n => inBits(n).includes(main))
    || elems.some(e => Object.entries(e.C).some(([p, bits]) => p !== 'CLK' && bits.includes(main)) || (e.addr || []).includes(main) || (e.data || []).includes(main) || (e.en || []).includes(main));
  const needFall = main != null && (negMain.length > 0 || usesMain);

  // ---- the DCMs' outputs: the edges of each cycle (core/compiled-prims.js dcmSchedule), steps of the loop
  // after the main clock's edge at the same time; the outputs nothing reads are left out, and the falling edges
  // of a clock only rising-edge flip-flops read are not steps (its rising edge then is one from 0: rise-only, no
  // net of its own). A schedule for each DCM the main clock clocks, with the DCMs it clocks in turn (a group),
  // and its own count of cycles: a DCM whose RST the design drives starts its schedule again after a reset
  let sched = null;
  const groups = [], unread = new Set();   // (the bits of the outputs left out, or rise-only)
  if (dcms.length) {
    const asClock = new Set(clocked.map(clkBit));
    const other = new Set([...comb.flatMap(inBits), ...elems.flatMap(e => [...Object.entries(e.C).flatMap(([p, b]) => (p === 'CLK' && clocked.includes(e) ? [] : b)), ...(e.addr || []), ...(e.data || []), ...(e.en || [])]),
      ...ports.filter(p => p.dir !== 'input').flatMap(p => p.bits), ...dcms.flatMap(d => [d.C.CLKIN[0], ...(d.C.RST || [])]),
      ...(watch?.levels || []).map(w => w.bit), ...(watch?.pairs || []).flat().map(w => w.bit), ...(watch?.edges || []).flatMap(w => [w.bit, ...w.capture]),
      ...(watch?.vga ? [watch.vga.hs, watch.vga.vs, ...watch.vga.rgb] : [])]);
    const read = new Set([...other, ...asClock]);
    const waves = new Map(), level = new Map(), root = new Map();   // dcm -> its outputs' waveforms, its depth in a cascade, its group's DCM
    const driven = d => (d.C.RST || []).some(b => typeof b === 'number');
    const resolve = (d, seen = new Set()) => {
      if (waves.has(d)) return;
      if (seen.has(d)) throw new CompileError(`the DCM '${cellName(d.name)}' is in a loop of DCMs: not compiled`);
      seen.add(d);
      const rst = d.C.RST || [];
      const src = dcmOf.get(d.C.CLKIN[0]);
      if (src) resolve(src[0], seen);
      if (src && driven(d)) throw new CompileError(`the DCM '${cellName(d.name)}' has its RST driven by the design and is clocked by ${src[1]} of '${cellName(src[0].name)}': not compiled`);
      if (src && driven(src[0])) throw new CompileError(`the DCM '${cellName(d.name)}' is clocked by ${src[1]} of '${cellName(src[0].name)}', whose RST is driven by the design: not compiled`);
      const input = src ? waves.get(src[0])[src[1]] : { pre: [], s: [0, 1], q: [1, 1] };
      if (!input) throw new CompileError(`the DCM '${cellName(d.name)}' is clocked by ${src[1]} of '${cellName(src[0].name)}': not compiled`);
      level.set(d, src ? level.get(src[0]) + 1 : 0);
      root.set(d, src ? root.get(src[0]) : d);
      // (RST tied high: never locked, its outputs low)
      try { waves.set(d, rst.includes('1') ? {} : dcmWaves(d.P, input, cellName(d.name))); } catch (e) { throw new CompileError(`${e.message}: not compiled`); }
    };
    dcms.forEach(d => resolve(d));
    for (const r of roots) groups.push({ dcm: r, rst: driven(r) ? r.C.RST : null, chans: [] });
    for (const d of dcms) {
      const g = groups.find(x => x.dcm === root.get(d));
      for (const [port, v] of Object.entries(d.outs)) {
        const w = waves.get(d)[port], b = d.C[port][0];
        if (!w) continue;
        if (!read.has(b)) { unread.add(b); continue; }
        // (CLK90 / CLK270: CLK0 / CLK180 delayed, which a reset does not stop at once: not modelled)
        if (g.rst && (port === 'CLK90' || port === 'CLK270')) throw new CompileError(`the DCM '${cellName(d.name)}' has its RST driven by the design and its ${port} used: not compiled`);
        const riseOnly = !other.has(b) && clocked.every(e => clkBit(e) !== b || pol(e, 'CLK_POLARITY') === 1);
        if (riseOnly) unread.add(b);
        g.chans.push({ wave: w, v, bit: b, level: level.get(d), riseOnly });
      }
    }
    for (const g of groups) try { g.sched = dcmSchedule(g.chans); } catch (e) { throw new CompileError(`${e.message}: not compiled`); }
    // (the groups' steps in the same ticks: the least common multiple of their ticks per cycle)
    const T = groups.reduce((t, g) => lcm(t, g.sched.T), 2);
    if (T * 64 > 2 ** 31) throw new CompileError(`the DCMs' clocks have no common time step: not compiled`);
    sched = { T };
  }
  const asyncEls = elems.filter(e => async(e));

  // ---- activity (#464): the combinational cells in blocks by the values they read, each block evaluated only
  // when one of them changed since the last evaluation. A change is a bit of the dirty words D<j>, set by the main
  // clock's commits (its flip-flops, its memories' writes) and by the cuts (a cell whose value changes much less
  // often than what it reads: a counter's end, #670: any cell of a number, those the profile finds changing about
  // as often as what they read no cuts), cleared after each evaluation; bit 0 (all): every block. A value read in
  // part is a key of its bits read (a counter's high bits change seldom). A block reading a value that changes at
  // every step (the main clock's, a DCM's output) is always evaluated; the values with no bit (the inputs, the
  // other clocks' flip-flops, the latches, the asynchronous loads) change between runs or when settling, after
  // which every block is (all).
  const always = new Set(dcms.flatMap(d => Object.values(d.outs)));
  if (mainPort && usesMain) always.add(mainPort.v);
  const flagged = new Set(onMain.filter(e => e.q != null).map(e => e.q));
  const memFlagged = new Set(mems.filter(m => m.writes.some(w => clkBit(w) === main)).map(m => m.k));
  const varsIn = n => [...new Set(inBits(n).map(b => (typeof b === 'number' ? src.get(b)?.[0] : null)).filter(v => v != null))];
  // (#670: a value of a number's kind read in part, a key of its bits read: 'v<var>&<mask>'; a counter's high bits
  // change much less often than its low ones)
  const keyOf = (v, mask) => (vars[v].kind === 'n' && mask !== (vars[v].w >= 32 ? -1 : 2 ** vars[v].w - 1) ? `v${v}&${mask}` : `v${v}`);
  const masksIn = n => {
    const m = new Map();
    for (const b of inBits(n)) {
      const s = typeof b === 'number' ? src.get(b) : null;
      if (s) m.set(s[0], (m.get(s[0]) || 0) | (1 << s[1]));
    }
    return m;
  };
  // (#670: a cell's cost, as cells, from its operations: a table's address of ten bits, ten times a NOT's)
  const weightOf = n => Math.max(1, (cellExpr(n).match(/>>>|<<|>>|[-+*&|^~?[]|===|!==/g) || []).length / OPS);
  // the blocks (the cells reading the same values), in an order the cells' dependencies keep
  const blocksOf = () => {
    const reads = new Map();   // comb node -> { keys: Set ('v<var>', 'v<var>&<mask>', 'm<memory>'), always }
    for (const n of order) {
      n.cut = vars[n.y].kind === 'n' && !n.nocut;
      const r = { keys: new Set(), always: false };
      for (const [v, mask] of masksIn(n)) {
        const d = combOf.get(v);
        if (d) {
          if (d.cut) r.keys.add(keyOf(v, mask));
          else { const dr = reads.get(d); dr.keys.forEach(k => r.keys.add(k)); r.always ||= dr.always; }
        } else if (always.has(v)) r.always = true;
        else if (flagged.has(v)) r.keys.add(keyOf(v, mask));
      }
      if (n.type === '$memrd' && memFlagged.has(n.mem.k)) r.keys.add(`m${n.mem.k}`);
      r.always ||= !activity;
      reads.set(n, r);
      n.reads = r;
    }
    const keyed = new Set([...reads.values()].flatMap(r => [...r.keys].map(k => k.split('&')[0])));
    const blocks = new Map();   // key -> { cells, keys, always, deps: Set of blocks }
    for (const n of order) {
      const r = reads.get(n), key = r.always || !activity ? '*' : [...r.keys].sort().join(' ');
      if (!blocks.has(key)) blocks.set(key, { cells: [], keys: [...r.keys], always: r.always, deps: new Set(), weight: 0 });
      const b = blocks.get(key);
      b.cells.push(n);
      // (a cut read under a guard: its test of its changes)
      b.weight += weightOf(n) + (n.cut && keyed.has(`v${n.y}`) ? DETECT : 0);
      n.block = b;
    }
    for (const n of order) for (const v of varsIn(n)) { const d = combOf.get(v); if (d && d.block !== n.block) n.block.deps.add(d.block); }
    const order_ = [], placed = new Set();
    const place = (b) => { if (placed.has(b)) return; placed.add(b); b.deps.forEach(place); order_.push(b); };
    blocks.forEach(place);
    return order_;
  };
  let blockOrder = blocksOf();
  // (the main clock's edges: their commits flag what changed, @@changes <edge>@@ and @@set m<memory>@@, as
  // generate writes them)
  const fire = (els, edge) => `${els.map(sample).join('\n')}\n@@changes ${edge}@@\n${els.map(e => commit(e, e.type === '$memwr')).join('\n')}`;
  const ckSet = (on) => {
    if (!mainPort) return '';
    const v = `v${mainPort.v}`, off = mainPort.bits.indexOf(main);
    if (mainPort.w === 1) return `${v} = ${lit(on, mainPort.kind)};`;
    return mainPort.kind === 'b' ? `${v} = ${on ? `${v} | ${1n << BigInt(off)}n` : `${v} & ~${1n << BigInt(off)}n`};` : `${v} = ${on ? fix32(`${v} | ${2 ** off}`, mainPort.w) : `${v} & ${~(2 ** off) >>> 0}`};`;
  };
  // settling: the other clocks' edges, then the asynchronous elements
  const dlist = [...derived].map(([b, els], k) => ({ b, k, els, pos: els.filter(e => pol(e, 'CLK_POLARITY') === 1), neg: els.filter(e => pol(e, 'CLK_POLARITY') !== 1) }));
  const settleCode = !dlist.length && !asyncEls.length ? '' : [
    ...dlist.map(d => `{ const k = ${sig([d.b], 'n')}; f${d.k} = p${d.k} !== -1 && k !== p${d.k} ? (k ? 1 : 2) : 0; p${d.k} = k; }`),
    ...(dlist.length ? [
      `if (${dlist.map(d => `f${d.k}`).join(' | ')}) {`,
      ...dlist.map(d => `${d.pos.length ? `if (f${d.k} === 1) { ${d.pos.map(sample).join(' ')} }` : ''} ${d.neg.length ? `if (f${d.k} === 2) { ${d.neg.map(sample).join(' ')} }` : ''}`),
      ...dlist.map(d => `${d.pos.length ? `if (f${d.k} === 1) { ${d.pos.map(commit).join(' ')} }` : ''} ${d.neg.length ? `if (f${d.k} === 2) { ${d.neg.map(commit).join(' ')} }` : ''}`),
      'ch = true; }'] : []),
    ...asyncEls.map(async),
  ].join('\n');

  // ---- what each cycle counts (watch)
  const levels = watch?.levels || [], pairs = watch?.pairs || [], edges = watch?.edges || [];
  const at = (w) => `${sig([w.bit], 'n')} === ${w.on}`;
  // (the time each value lasts, in cycles: half a cycle before the main clock's rising edge, half after it,
  // as the event-driven simulator's time; without the falling edge, the half after a rising edge is the half
  // before the next one, sampled once: the window's first half, its middle cycles whole, its last half)
  // (#464: counted in runs: the cycles the watched values stay the same (in l<var>) add up in R, added to the
  // counts whose values hold (FL) when one of them changes and at the end of run(), the same sums of halves;
  // FL has no branch and runs at the start of run(), so that V8 optimizes it with the types of all its sites)
  const counted = levels.length + pairs.length > 0;
  const watched = [...new Set([...levels, ...pairs.flat()].map(w => src.get(w.bit)?.[0]).filter(v => v != null))];
  const flushFn = `function FL(R${watched.map(v => `, v${v}`).join('')}) {\n${[
    ...levels.map((w, i) => `K[${i}] += ${at(w)} ? R : 0;`),
    ...pairs.map(([a, b], i) => `K[${levels.length + i}] += ${at(a)} && ${at(b)} ? R : 0;`),
  ].join('\n')}\n}`;
  const flush = `FL(R${watched.map(v => `, l${v}`).join('')});`;
  const count = W => `${watched.length ? `if (${watched.map(v => `v${v} !== l${v}`).join(' || ')}) { ${flush} R = 0; ${watched.map(v => `l${v} = v${v};`).join(' ')} }\n` : ''}R += ${W};`;
  const vgaCode = watch?.vga ? VGA_CODE(sig([watch.vga.hs], 'n'), sig([watch.vga.vs], 'n'), sig(watch.vga.rgb, 'n')) : '';
  const edgeCode = edges.map((w, i) => `{ const e = ${sig([w.bit], 'n')}; if (e${i} === 1 && e === 0) EV.push(cy, ${sig(w.capture, 'n')}); e${i} = e; }`).join('\n');

  // ---- the loop's steps: the main clock's rising edge (the cycle's samples before it), its falling edge; with
  // DCMs, the cycle's steps in time order, those of the groups at the same tick and depth together (DSj: tick x 64
  // + depth, number of changes, then variable / value pairs; DOj: each cycle's first step; DCj: the cycles since
  // the start or the reset, the schedule's S first ones then its steady H ones; Zj: in reset). A reset is seen
  // at the end of a time (tk: the tick of the last step), after the edges of the DCM at that time (in the
  // event-driven simulator they come a few deltas before those of RST); it sets the group's outputs to 0 and
  // drops its steps left; a cycle's rising edge with RST low starts the group's schedule again
  const endCount = counted && !needFall ? `if (n) { ${count('0.5')} }` : '';
  const riseCount = `${counted ? (needFall ? count('0.5') : count('(cy ? 1 : 0.5)')) : ''}\n${edgeCode}\n${vgaCode}`;
  let dcmStep = '', dcmTables = '', dcmLocals = '', dcmSave = '';
  if (sched) {
    const { T } = sched, gs = groups.filter(g => g.chans.length);
    gs.forEach((g, j) => { g.j = j; });
    dcmTables = gs.map(g => {
      const ds = [], dof = [], m = T / g.sched.T;
      for (const steps of g.sched.cycles) {
        dof.push(ds.length);
        for (const st of steps) ds.push(st.tick * m * 64 + st.level, st.sets.length, ...st.sets.flat());
      }
      dof.push(ds.length);
      return `const DS${g.j} = Int32Array.from([${ds.join(',')}]), DO${g.j} = Int32Array.from([${dof.join(',')}]);\nlet DC${g.j} = 0${g.rst ? `, Z${g.j} = 1` : ''};`;
    }).join('\n');
    dcmLocals = ` let fd = true, tk = -1${gs.map(g => `, dc${g.j} = DC${g.j}, si${g.j} = 0, se${g.j} = 0${g.rst ? `, z${g.j} = Z${g.j}` : ''}`).join('')};`;
    dcmSave = gs.map(g => ` DC${g.j} = dc${g.j};${g.rst ? ` Z${g.j} = z${g.j};` : ''}`).join('');
    const zero = c => `v${c.v} = ${lit(0, vars[c.v].kind)};`;
    const cases = g => g.chans.map(c => `case ${c.v}: ${c.riseOnly ? `p${dlist.find(d => d.b === c.bit).k} = 0; ` : ''}v${c.v} = ${vars[c.v].kind === 'b' ? 'BigInt(x)' : 'x'}; break;`).join(' ');
    const rst = g => `${sig(g.rst, 'n')} === 1`;
    const start = g => `{ const c = dc${g.j} < ${g.sched.S} ? dc${g.j} : ${g.sched.S} + (dc${g.j} - ${g.sched.S}) % ${g.sched.H}; si${g.j} = DO${g.j}[c]; se${g.j} = DO${g.j}[c + 1]; dc${g.j}++; }`;
    const resets = gs.filter(g => g.rst);
    dcmStep = `    st: for (;;) {
      let nk = ${T * 64};
      ${gs.map(g => `if (si${g.j} < se${g.j} && DS${g.j}[si${g.j}] < nk) nk = DS${g.j}[si${g.j}];`).join(' ')}
      const nt = ${needFall ? `Math.min(fd ? ${T} : ${T / 2}, nk >> 6)` : 'nk >> 6'};
      ${resets.length ? `if (nt > tk) {
        let r = false;
        ${resets.map(g => `if (!z${g.j} && ${rst(g)}) { z${g.j} = 1; dc${g.j} = 0; si${g.j} = se${g.j}; ${g.chans.map(zero).join(' ')} r = true; }`).join('\n        ')}
        if (r) break st;
        tk = nt;
      }` : ''}
      if (nt === ${T}) {
        if (cy === n) { ${endCount} break run; }
${riseCount}
        cy++;
        ${needFall ? ckSet(1) : ''} fd = ${!needFall}; tk = 0;
        ${gs.map(g => (g.rst ? `if (!${`(${rst(g)})`}) { z${g.j} = 0; ${start(g)} }` : start(g))).join('\n        ')}
${fire(posMain, 'r')}
        ${posMain.length || needFall ? 'break st;' : 'continue st;'}
      }
      if (!fd && nt === ${T / 2}) { fd = true; ${counted ? count('0.5') : ''} ${ckSet(0)}
${fire(negMain, 'f')}
        break st; }
      ${gs.map(g => `if (si${g.j} < se${g.j} && DS${g.j}[si${g.j}] === nk) { let k = DS${g.j}[si${g.j} + 1]; si${g.j} += 2; for (; k > 0; k--, si${g.j} += 2) { const x = DS${g.j}[si${g.j} + 1]; switch (DS${g.j}[si${g.j}]) { ${cases(g)} } } }`).join('\n      ')}
      break st;
    }`;
  }

  // ---- the code
  const V = vars.map((_, i) => i);
  const memInit = mems.map(m => {
    const bits = pbits(m.P.INIT ?? '');
    const words = [];
    for (let a = 0; a < m.size; a++) {
      const wbits = bits.slice(a * m.width, (a + 1) * m.width);
      words.push(wbits.some(Boolean) ? bigOf(wbits) : 0n);
    }
    const nz = words.some(x => x);
    if (m.kind === 'b') return `const M${m.k} = ${nz ? `[${words.map(x => `${x}n`).join(',')}]` : `new Array(${m.size}).fill(0n)`};`;
    return `const M${m.k} = ${nz ? `Uint32Array.from([${words.map(Number).join(',')}])` : `new Uint32Array(${m.size})`};`;
  });
  const memChars = memInit.reduce((n, l) => n + l.length, 0);
  const initOf = i => {
    const e = elems.find(x => x.q === i);
    return lit(e ? e.init : 0n, vars[i].kind);
  };
  const temps = elems.flatMap(e => (e.type === '$memwr' ? [`n${e.id} = ${lit(0, e.mem.kind)}`, `a${e.id} = 0`, `w${e.id} = ${lit(0, e.mem.kind)}`] : e.q != null ? [`n${e.id} = ${lit(0, vk(e))}`] : []));
  const templateOf = OUT => `"use strict";
${V.map(i => `let ${OUT ? 'v' : 'V'}${i} = ${initOf(i)};`).join('\n')}
${memInit.join('\n')}
${dlist.map(d => `let P${d.k} = -1;`).join('\n')}
const K = new Float64Array(${levels.length + pairs.length}), EV = [];
${watch?.vga ? `const VG = new Float64Array(${VGA_STATE.length}).fill(-1), FB = new Uint16Array(${VGA_W * VGA_H}); VG[${VGA_STATE.indexOf('ct')}] = 0; VG[${VGA_STATE.indexOf('frames')}] = 0; VG[${VGA_STATE.indexOf('L')}] = 0;` : ''}
${edges.map((_, i) => `let E${i} = -1;`).join(' ')}
${dcmTables}
${counted ? flushFn : ''}
function run(n) {
  ${V.length && !OUT ? `let ${V.map(i => `v${i} = V${i}`).join(', ')};` : ''}
  ${mems.map(m => `const m${m.k} = M${m.k};`).join(' ')}
  ${dlist.length ? `let ${dlist.map(d => `p${d.k} = P${d.k}, f${d.k} = 0`).join(', ')};` : ''}
  ${temps.length ? `let ${temps.join(', ')};` : ''}
  ${edges.length ? `let ${edges.map((_, i) => `e${i} = E${i}`).join(', ')};` : ''}
  ${watch?.vga ? `let ${VGA_STATE.map((k, i) => `g_${k} = VG[${i}]`).join(', ')};` : ''}
  let ph = 0, cy = 0, it = 0, ch = false@@decl@@;${dcmLocals}@@fns@@
  ${counted ? `let R = 0${watched.map(v => `, l${v} = v${v}`).join('')}; ${flush}` : ''}
  run: for (;;) {
@@comb@@
    ch = false;
${settleCode}
    if (ch) { if (++it > ${SETTLE_LIMIT}) throw new H.Error('the design does not settle (a loop through a latch or a clock?)'); @@all@@ continue; }
    it = 0;
${sched ? dcmStep : `    if (ph === 0) {
      if (cy === n) { ${endCount} break; }
${riseCount}
      cy++;
      ${needFall ? `${ckSet(1)} ph = 1;` : ''}
${fire(posMain, 'r')}
    } else {
${counted ? count('0.5') : ''}
      ${ckSet(0)} ph = 0;
${fire(negMain, 'f')}
    }`}
  }
  ${counted ? flush : ''}
  ${OUT ? '' : V.map(i => `V${i} = v${i};`).join(' ')}
  ${dlist.map(d => `P${d.k} = p${d.k};`).join(' ')}${dcmSave}
  ${edges.map((_, i) => `E${i} = e${i};`).join(' ')}
  ${watch?.vga ? VGA_STATE.map((k, i) => `VG[${i}] = g_${k};`).join(' ') : ''}
}
// the counts and the edges since the last take (the counts back to 0)
function take() { const counts = Array.from(K); K.fill(0); return { counts, edges: EV.splice(0) }; }
function set(k, x) { switch (k) { ${inputs.map(p => `case ${p.v}: ${OUT ? 'v' : 'V'}${p.v} = x; break;`).join(' ')} } }
function vals() { return [${V.map(i => `${OUT ? 'v' : 'V'}${i}`).join(', ')}]; }
return { run, set, vals, take, mems: [${mems.map(m => `M${m.k}`).join(', ')}]${watch?.vga ? ', vga: { state: VG, fb: FB }' : ''} };
`;
  // ---- the code of the segments (segs: [{ blocks, keys: Set of the values they read, or null: unguarded }]):
  // the template's @@…@@ filled in; prof: the dirty bits counted (H.P), for the segments' choice (segmentsOf)
  const generate = (segs, prof = false, OUT = false) => {
    // the dirty bits: one for the values the same guarded segments read (bit 0: all); one per value in the
    // profile, in the order they are read
    const readers = new Map(), bitOf = new Map(), bits = new Map();
    // (#670: a cell's value read only by its own segment, which runs already, sets no bit)
    const writer = new Map();   // a cell's 'v<var>' -> its segment
    segs.forEach((sg, i) => sg.blocks.forEach(b => b.cells.forEach(n => writer.set(`v${n.y}`, i))));
    segs.forEach((sg, i) => sg.keys?.forEach(k => {
      if (writer.get(k.split('&')[0]) === i) return;
      if (!readers.has(k)) readers.set(k, []);
      readers.get(k).push(i);
    }));
    for (const [k, r] of readers) { const sg = prof ? k : r.join(); if (!bits.has(sg)) bits.set(sg, bits.size + 1); bitOf.set(k, bits.get(sg)); }
    const words = Math.ceil((bits.size + 1) / 32);
    // a value's dirty bits ('v<var>', 'm<memory>'): its keys' bits, each with the mask of the value's bits that set it
    // (null: any bit)
    const byValue = new Map();
    for (const [k, i] of bitOf) {
      const [base, m] = k.split('&'), mask = m == null ? null : Number(m);
      if (!byValue.has(base)) byValue.set(base, new Map());
      const g = byValue.get(base);
      g.set(i, g.has(i) ? (g.get(i) === null || mask === null ? null : g.get(i) | mask) : mask);
    }
    const dirty = (base) => [...(byValue.get(base) || [])].map(([i, mask]) => ({ i, mask, d: `D${i >> 5}`, sh: i & 31, bit: (1 << (i & 31)) | 0, set: `D${i >> 5} |= ${(1 << (i & 31)) | 0};` }));
    // (numbers: the bit set with no branch, from the sign of y | -y)
    const setIf = (f, x) => { const y = f.mask == null ? x : `(${x} & ${f.mask})`; return `{ const y = ${y}; ${f.d} |= ((y | -y) >> 31) & ${f.bit}; }`; };
    const allDirty = Array.from({ length: words }, (_, j) => `D${j} = -1;`).join(' ');
    const clean = Array.from({ length: words }, (_, j) => `D${j} = 0;`).join(' ');
    // (prof: each dirty bit counted in H.P, the evaluations in its last element)
    const profCode = prof ? `{ const P = H.P; P[${words * 32}]++; ${Array.from({ length: words }, (_, j) => `if (D${j}) for (let b = 0; b < 32; b++) P[${j * 32} + b] += (D${j} >>> b) & 1;`).join(' ')} }` : '';
    // the quiet flip-flops: their next value only from cells of guarded segments, the inputs and constants (and
    // their own value, as their kind holds it); with the same values, the next edge gives the value the last one
    // gave, so that one of them changes only after one of those segments ran since the last edge: each segment
    // sets its bit in R<edge><j> (r: the rising edge's flip-flops, f: the falling edge's) when it runs
    const segOf = new Map();   // var -> its segment (guarded) or -1
    segs.forEach((sg, i) => sg.blocks.forEach(b => b.cells.forEach(n => segOf.set(n.y, sg.keys ? i : -1))));
    const inputVars = new Set(inputs.filter(p => !always.has(p.v)).map(p => p.v));
    const quiet = (e) => {
      if (!FF.has(e.type) || !dirty(`v${e.q}`).length) return null;
      const from = new Set();
      for (const [port, bits] of Object.entries(e.C)) {
        if (port === 'CLK' || port === 'Q') continue;
        for (const b of bits) {
          const v = typeof b === 'number' ? src.get(b)?.[0] : null;
          if (v == null || inputVars.has(v)) continue;
          if (!(segOf.get(v) >= 0)) return null;
          from.add(segOf.get(v));
        }
      }
      return from;
    };
    const quietOf = new Map(), ranBit = new Map(), ranBy = { r: new Set(), f: new Set() };
    for (const [edge, els] of [['r', posMain], ['f', negMain]]) {
      for (const e of els) {
        const q = quiet(e);
        if (!q) continue;
        quietOf.set(e, q);
        for (const i of q) { if (!ranBit.has(i)) ranBit.set(i, ranBit.size); ranBy[edge].add(i); }
      }
    }
    const ranWords = Math.ceil(ranBit.size / 32);
    const ranSet = i => ['r', 'f'].filter(edge => ranBy[edge].has(i)).map(edge => `R${edge}${ranBit.get(i) >> 5} |= ${(1 << (ranBit.get(i) & 31)) | 0};`).join(' ');
    const ranDecl = ['r', 'f'].filter(edge => ranBy[edge].size).flatMap(edge => Array.from({ length: ranWords }, (_, j) => `R${edge}${j} = 0`));
    // (each segment's code in pieces of `chunk` characters at most, each piece of a guarded one under its guard: a
    // piece the guard runs needlessly gives the same values)
    const pieces = segs.flatMap((sg, i) => {
      const cells = (ranBit.has(i) ? [ranSet(i)] : []).concat(sg.blocks.flatMap(b => b.cells).map(n => {
        const e = conv(cellExpr(n), n.kind, vars[n.y].kind), fs = dirty(`v${n.y}`);
        if (!fs.length) return `v${n.y} = ${e};`;
        if (vars[n.y].kind === 'b') return `{ const t = ${e}; if (t !== v${n.y}) { ${fs.map(f => f.set).join(' ')} } v${n.y} = t; }`;
        // (a cut's bit with no branch; a 1-bit cell's, the difference shifted)
        if (vars[n.y].w === 1) return `{ const t = ${e}; ${fs.map(f => `${f.d} |= (t ^ v${n.y}) << ${f.sh};`).join(' ')} v${n.y} = t; }`;
        return `{ const t = ${e}, x = t ^ v${n.y}; ${fs.map(f => setIf(f, 'x')).join(' ')} v${n.y} = t; }`;
      }));
      let guard = null;
      if (sg.keys) {
        const mask = new Array(words).fill(0);
        mask[0] = 1;
        for (const k of sg.keys) { const i = bitOf.get(k); if (i != null) mask[i >> 5] |= 1 << (i & 31); }
        guard = mask.map((m, j) => (m ? `(D${j} & ${m})` : '')).filter(Boolean).join(' | ');
      }
      return chunks(cells, chunk).map(c => (guard ? `if (${guard}) {\n${c}\n}` : c));
    });
    // (OUT, a split run(): these pieces in functions inside run(), below)
    const fns = OUT ? chunks(pieces, chunk) : [];
    const combCode = (OUT ? fns.map((_, k) => `CF${k}();`).join(' ') : pieces.join('\n')) + `\n${profCode}\n${clean}`;
    const fnsCode = fns.map((c, k) => `\n  const CF${k} = () => {\n${c}\n  };`).join('');

    // the changes an edge of the main clock commits: one test of the flip-flops of a dirty bit, their bits'
    // differences (the quiet ones when one of their segments ran: R<edge><j>, cleared at the edge)
    const changes = (els, edge) => {
      const by = new Map();
      for (const e of els) {
        if (e.q == null) continue;
        const q = quietOf.get(e), mask = new Array(ranWords).fill(0);
        q?.forEach(i => { const r = ranBit.get(i); mask[r >> 5] |= 1 << (r & 31); });
        for (const f of dirty(`v${e.q}`)) {
          const key = `${f.i} ${q ? mask.join() : ''}`;
          if (!by.has(key)) by.set(key, { f, ran: q ? mask.map((m, j) => (m ? `(R${edge}${j} & ${m})` : '')).filter(Boolean).join(' | ') : null, n: [], b: [] });
          by.get(key)[vk(e)].push([e, f.mask]);
        }
      }
      // (numbers: the bit set with no branch, from the sign of d | -d: a change every other cycle is no
      // mispredicted branch; a flip-flop read in part, the difference of those bits)
      const byRan = new Map();
      for (const { f, ran, n, b } of by.values()) {
        const set = [...(n.length ? [`{ const d = ${n.map(([e, m]) => (m == null ? `(v${e.q} ^ n${e.id})` : `((v${e.q} ^ n${e.id}) & ${m})`)).join(' | ')}; ${f.d} |= ((d | -d) >> 31) & ${f.bit}; }`] : []),
          ...(b.length ? [`if (${b.map(([e]) => `v${e.q} !== n${e.id}`).join(' || ')}) ${f.set}`] : [])].join(' ');
        if (!byRan.has(ran || '')) byRan.set(ran || '', []);
        byRan.get(ran || '').push(set);
      }
      return [...byRan].map(([ran, sets]) => (ran ? `if (${ran}) {\n${sets.join('\n')}\n}` : sets.join('\n'))).join('\n') + (ranBy[edge].size ? `\n${Array.from({ length: ranWords }, (_, j) => `R${edge}${j} = 0;`).join(' ')}` : '');
    };

    const fill = { comb: () => combCode, fns: () => fnsCode, all: () => allDirty, decl: () => `${Array.from({ length: words }, (_, j) => `, D${j} = -1`).join('')}${ranDecl.map(r => `, ${r}`).join('')}`,
      changes: edge => changes(edge === 'r' ? posMain : negMain, edge), set: k => dirty(k).map(f => f.set).join(' ') };
    const code = templateOf(OUT).replace(/@@(\w+)(?: (\w+))?@@/g, (_, what, arg) => fill[what](arg));
    // (#629: a run() of more than splitAt characters, above V8's limit of the bytecode it optimizes (60 KB, about 0.66
    // byte a character), is not optimized: then the values are the code's own, not run()'s, and its combinational
    // cells functions of `chunk` characters at most, inside run(); below it, slower)
    // (#659: the memories' initial values, a table's contents, are no code of run())
    return !OUT && code.length - memChars > splitAt ? generate(segs, prof, true) : code;
  };

  // the segments: one, unguarded, without activity; else the profile of the blocks' code (the cycles of a run
  // from the start, `profile` of them) chooses them (segmentsOf); 'fine': each block guarded, 'max': the fewest
  // guarded segments (every rate 0), to test the code
  const fine = blockOrder.map(b => ({ blocks: [b], keys: b.always ? null : new Set(b.keys) }));
  let segs = [{ blocks: blockOrder, keys: null }], work = null;
  if (activity === 'fine') segs = fine;
  else if (activity === 'max') segs = segmentsOf(blockOrder, new Map());
  else if (activity && profile > 0 && blockOrder.some(b => !b.always)) {
    // (the rates: each key's changes per evaluation)
    const profileOf = () => {
      const fine = blockOrder.map(b => ({ blocks: [b], keys: b.always ? null : new Set(b.keys) }));
      const keys = [...new Set(fine.flatMap(sg => (sg.keys ? [...sg.keys] : [])))];
      const P = new Float64Array(Math.ceil((keys.length + 1) / 32) * 32 + 1);
      new Function('H', generate(fine, true))({ ...HELPERS, Error: CompileError, P }).run(profile);
      return { rate: new Map(keys.map((k, i) => [k, P[i + 1] / Math.max(1, P[P.length - 1])])) };
    };
    try {
      const { rate } = profileOf();
      // (#670: a cut whose value changes about as often as what it reads, no cut: its readers read that, and its
      // test of its changes is saved; the rates of what it reads are the profile's already)
      const changes = new Map();   // 'v<var>' -> its changes per evaluation (the most of its keys')
      for (const [k, r] of rate) { const base = k.split('&')[0]; changes.set(base, Math.max(changes.get(base) ?? 0, r)); }
      let pruned = false;
      for (const n of order) {
        const out = changes.get(`v${n.y}`);
        if (!n.cut || out == null) continue;
        const pin = n.reads.always ? 1 : Math.min(1, [...n.reads.keys].reduce((p, k) => p + (rate.get(k) || 0), 0));
        if (out > CUT_GAIN * pin) { n.nocut = true; pruned = true; }
      }
      if (pruned) blockOrder = blocksOf();
      const g = segmentsOf(clustered(blockOrder, rate), rate);
      // (worth its overhead, the dirty bits and the values kept from step to step, when it evaluates at most
      // half the cells)
      if (g.cost <= WORTH * blockOrder.reduce((a, b) => a + b.weight, 0)) { segs = g; work = g.cost; }
    } catch { /* (a design that does not settle: unguarded, the error is CompiledSim's) */ }
  }
  const code = generate(segs);
  const all = order.reduce((a, n) => a + weightOf(n), 0);
  const nets = new Map();
  for (const [name, n] of Object.entries(mod.netnames || {})) if (!n.hide_name && !n.bits.some(b => unread.has(b))) nets.set(name, n.bits);
  for (const p of ports) nets.set(p.name, p.bits);
  return {
    code, inputs, ports, nets, src, vars, warnings,
    clock: mainPort ? { port: mainPort.name } : null,
    stats: { cells: names.length, comb: order.length, flipflops: elems.filter(e => FF.has(e.type)).length, memories: mems.length, clocks: dlist.length + (main != null ? 1 : 0), bothEdges: needFall, dcms: dcms.length,
      // (#670: the combinational cells' cost, as cells (their operations), and the part of it a step evaluates, as the
      // profile estimates it, guards and tests of changes counted: all of it unguarded)
      work: { all: +all.toFixed(1), step: +(work ?? all).toFixed(1) } },
  };
}

/** A compiled design running: set(input, value), cycle(n), get(port or net) -> BigInt. */
export class CompiledSim {
  constructor(model) {
    this.model = model;
    this.fn = new Function('H', model.code);
    this.reset();
  }
  /** Back to the state after configuration (the inputs kept). */
  reset() {
    const keep = this.inst ? this.model.inputs.map(p => this.inst.vals()[p.v]) : null;
    this.inst = this.fn({ ...HELPERS, Error: CompileError });
    if (keep) this.model.inputs.forEach((p, i) => this.inst.set(p.v, keep[i]));
    this.cycles = 0;
    this.inst.run(0);
  }
  /** Set an input port (a number or a BigInt); the main clock is driven by cycle(). */
  set(name, value) {
    const p = this.model.inputs.find(i => i.name === name);
    if (!p) throw new Error(`'${name}' is not an input port`);
    const v = BigInt.asUintN(p.w, BigInt(value));
    this.inst.set(p.v, p.kind === 'b' ? v : Number(v));
  }
  /** Run n cycles of the main clock (n = 0: settle after set()). */
  cycle(n = 1) {
    // (#650: in pieces of PIECE cycles, the same values and counts: V8 optimizes a run() called again and again by
    // its calls, with Turbofan; a run() of millions of cycles, by on-stack replacement of its loop, which in Chrome
    // leaves a large one in Maglev, 2 to 3 times slower)
    for (let k = n; k > PIECE; k -= PIECE) this.inst.run(PIECE);
    this.inst.run(n > PIECE ? (n - 1) % PIECE + 1 : n);
    this.cycles += n;
  }
  /** What the cycles counted since the last take (compileNetlist's watch): { counts: [levels…, pairs…],
   *  edges: [cycle, captured, cycle, captured…] } (the cycles counted from the start of each run). */
  take() { return this.inst.take(); }
  /** The VGA monitor (compileNetlist's watch.vga): { state: VG (VGA_STATE's values), fb } or null. */
  get vga() { return this.inst.vga || null; }
  /** The value of a port or a named net (BigInt). */
  get(name) {
    const bits = this.model.nets.get(name);
    if (!bits) throw new Error(`no port or net '${name}'`);
    return this.bits(bits);
  }
  bits(bits) {
    const vals = this.inst.vals();
    let v = 0n;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      const s = typeof b === 'number' ? this.model.src.get(b) : null;
      const bit = s ? (BigInt(vals[s[0]]) >> BigInt(s[1])) & 1n : b === '1' ? 1n : 0n;
      v = (v << 1n) | bit;
    }
    return v;
  }
}
