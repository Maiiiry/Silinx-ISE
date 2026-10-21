// Silinx schematic documents (<name>.sch.json): model, symbol library, connectivity,
// HDL generation and HDL -> schematic import. Isomorphic (no DOM).
//
//   import { SYMBOLS, newDoc, normalizeDoc, symbolDef, symbolPins, netlist, generateHdl,
//            schematicFromHdl, modulesFromLibrary } from '/core/schdoc.js';
//
// Document format (version 1, all coordinates in sheet pixels on a GRID = 10 px grid):
//   { version: 3, name, lang: 'vhdl'|'verilog', sheet: { w, h },
//     symbols: [{ id, type, x, y, rot: 0|90|180|270, mirror: bool, name, params: {...}, hdl?: string }],
//     wires:   [{ id, points: [{x,y},...], bus?: bool }],
//     labels:  [{ id, x, y, net }],          // net name attached to the wire point (x,y)
//     ports:   [{ id, name, dir: 'in'|'out'|'inout', width, x, y, type?, side? }],   // I/O markers
//              (side: where the marker's body is from its connection point, W N E S; by default W for
//              an input, E for an output or a bidirectional port, #296)
//     hdl?:    { lang, context, generics: [{ name, type, default }], decls, arch },  // verbatim HDL
//     generatedFile?: 'src/name.vhd',
//     description?: 'text' }                // shown on the sheet, a comment in the generated HDL
//
// (x, y) of a symbol is the top-left corner of its (rotated) bounding box; rotation is clockwise.
// Connectivity is geometric, at the ends only (#678): wire end points, pins and I/O markers at the
// same point connect; a wire passing over a pin or another wire (a segment or a bend of it) does not.
// A connection made in the middle of a wire (a wire ended on its segment, a symbol dropped onto it)
// splits that wire there (splitWiresAt). Labels attach to the wire under them; labels (and I/O
// markers) with the same name join their nets.
import { VHDL93_WORDS, VERILOG_WORDS, reservedError } from './reserved.js';
import { DEVICE_PRIMITIVES, primitiveOf } from './primitives.js';
import { BLOCK_MARK, blockMarkOf, declaredIn, generateHdl, isBlockSymbol } from './schdoc-hdl.js';
import { mergeNetWires } from './schdoc-place.js';
import {
  modulesFromLibrary, schematicFromHdl
} from './schdoc-from-hdl.js';
export {
  modulesFromLibrary, schematicFromHdl
};
export {
  mergeNetWires
};
export {
  BLOCK_MARK, blockMarkOf, generateHdl, isBlockSymbol
};

export const GRID = 10;
// 2 (#301): the M4_1's and DEMUX's select bits on pins of their own (a document of version 1 keeps its bus S)
// 3 (#678): connections at the wires' ends only (a document of version 2 has its wires split where
// they connected in their middle: a pin, a marker, a wire end or a bend on them)
export const DOC_VERSION = 3;

export const snap = v => Math.round(v / GRID) * GRID;
export const r10 = v => Math.ceil(v / GRID) * GRID;
const clone = o => JSON.parse(JSON.stringify(o));
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// ===================================================================== symbol library
const P_WIDTH = { name: 'width', label: 'Width', kind: 'int', default: 1, min: 1, max: 1024 };
const P_INIT = { name: 'init', label: 'INIT', kind: 'select', options: ['0', '1'], default: '0' };

function gateSym(op, n, title) {
  return {
    category: 'Logic', title, gate: op, inputs: n,
    description: `${n > 1 ? n + '-input ' : ''}${op.toUpperCase()} gate (bitwise when Width > 1)`,
    params: [P_WIDTH],
  };
}

export const SYMBOLS = {};
// gates, each followed by its inverted-input variants (Xilinx ANDnBk...: inputs I0..I(k-1) inverted; XORnBk /
// XNORnBk Silinx symbols, no such Xilinx ones, #337)
for (const [op, ns, inv] of [['and', [2, 3, 4, 5], true], ['or', [2, 3, 4, 5], true], ['nand', [2, 3, 4], true], ['nor', [2, 3, 4], true], ['xor', [2, 3, 4], true], ['xnor', [2, 3, 4], true]])
  for (const n of ns) {
    // (5 inputs: kept for the schematics that have them and ISE's AND5 / OR5, not offered: at most 4
    // inputs a gate, more through buses, #171)
    // (the palette lists one entry a gate, AND…, the 2-input one: its Inputs make AND3 / AND4, #330)
    const OP = op.toUpperCase();
    SYMBOLS[`${op}${n}`] = { ...gateSym(op, n, `${OP}${n}`), ...(n > 2 ? { hidden: true } : {}),
      ...(n === 2 ? { paletteTitle: OP, paletteDescription: `${OP} gate of 2, 3 or 4 inputs, its inputs and inverted inputs in its properties (bitwise when Width > 1)` } : {}) };
    // (the palette lists the basic gate only: its Inverted inputs make the variant, #328)
    if (inv) for (let k = 1; k <= n; k++) {
      SYMBOLS[`${op}${n}b${k}`] = {
        ...gateSym(op, n, `${OP}${n}B${k}`), invIn: k, hidden: true, ...(op === 'xor' || op === 'xnor' ? { noLib: true } : {}),
        description: `${n}-input ${op.toUpperCase()} gate with ${k === 1 ? 'input I0' : k === 2 ? 'inputs I0 and I1' : `inputs I0..I${k - 1}`} inverted (bitwise when Width > 1)`,
      };
    }
  }
/** The gate of `type`'s kind with n inputs (its own by default), the first k inverted (AND3 + 2 = AND3B2, AND3B2 + 0 =
 *  AND3, AND2 with 4 inputs = AND4), or null when there is none (#328, #330). */
export function gateVariant(type, k, n) {
  const S = SYMBOLS[type];
  if (!S?.gate || !(S.inputs > 1)) return null;
  const t = `${S.gate}${n ?? S.inputs}${k > 0 ? `b${k}` : ''}`;
  return SYMBOLS[t] ? t : null;
}
SYMBOLS.inv = { category: 'Logic', title: 'INV', gate: 'not', inputs: 1, description: 'Inverter', params: [P_WIDTH] };
SYMBOLS.buf = { category: 'Logic', title: 'BUF', gate: 'buf', inputs: 1, description: 'Buffer', params: [P_WIDTH] };
// tri-state buffers (Xilinx BUFE / BUFT families): O = I while enabled, Z (released) otherwise, so that
// several of them (and bidirectional pins / I/O markers) may drive one net, a bus
SYMBOLS.tbuf = {
  // (BUFE and BUFT only in the palette, their Width and Pins per bit making BUFE4, BUFT8…, #326)
  category: 'Tri-State', title: 'TBUF', presetsOnly: true,
  description: 'Tri-state buffer: O = I while enabled, Z (high impedance, released) otherwise; E active high (BUFE) or T active low (BUFT)',
  params: [P_WIDTH, { name: 'enable', label: 'Enable input', kind: 'select', options: ['E', 'T'], default: 'E' },
    { name: 'bits', label: 'Pins per bit (I0.., O0..)', kind: 'bool', default: false }],
  presets: [
    { title: 'BUFE', params: { width: 1, enable: 'E' }, description: 'Tri-state buffer, active-high enable: O = I when E = 1, Z when E = 0' },
    { title: 'BUFT', params: { width: 1, enable: 'T' }, description: 'Tri-state buffer, active-low enable T: O = I when T = 0, Z when T = 1' },
  ],
};
// the multiplexers' and demultiplexers' enable E (#301: as the Xilinx M2_1E / M4_1E, the outputs 0 when
// E = 0), and their select bits as pins of their own (S1 S0, as the Xilinx M4_1E and the decoders' A1 A0);
// selBus: the select as one bus pin S, as a M4_1 / DEMUX saved before #301 has it (normalizeDoc)
const P_EN = { name: 'en', label: 'Enable input E', kind: 'bool', default: false };
const P_SELBUS = { name: 'selBus', label: 'Select as a bus (S)', kind: 'bool', default: false };
// (one palette entry each, the enable E their parameter, #313; one MUX, the M2_1, its Select bits making M4_1 …
// M16_1, #334)
SYMBOLS.mux2 = { category: 'Mux', title: 'M2_1', description: '2:1 multiplexer (O = S0 ? D1 : D0)', params: [P_WIDTH, P_EN],
  paletteTitle: 'MUX', paletteDescription: 'Multiplexer of 2, 4, 8 or 16 data inputs, its select bits (1 to 4), select bus and enable in its properties (bitwise when Width > 1)' };
SYMBOLS.mux4 = { category: 'Mux', title: 'M4_1', hidden: true, description: '4:1 multiplexer (select S1 S0)', params: [P_WIDTH, P_EN, P_SELBUS] };
SYMBOLS.mux8 = { category: 'Mux', title: 'M8_1', hidden: true, description: '8:1 multiplexer (select S2 S1 S0)', params: [P_WIDTH, P_EN, P_SELBUS] };
SYMBOLS.mux16 = { category: 'Mux', title: 'M16_1', hidden: true, description: '16:1 multiplexer (select S3 S2 S1 S0)', params: [P_WIDTH, P_EN, P_SELBUS] };
// the multiplexers' number of data inputs
export const MUX_INPUTS = { mux2: 2, mux4: 4, mux8: 8, mux16: 16 };
SYMBOLS.demux = {
  // (one entry, DEMUX, the enable E, the select bits and the select bus its parameters, #313, #334; drawn DEMUX1_4…)
  category: 'Mux', title: 'DEMUX', description: '1:2^n demultiplexer: output O<S> = D, the other outputs 0 (bitwise when Width > 1)',
  params: [P_WIDTH, { name: 'sel', label: 'Select bits', kind: 'int', default: 1, min: 1, max: 4 }, P_EN, P_SELBUS],
};
// (one palette entry each, #324: DECODER as D2_4E, ENCODER as ENC4_2; their options make D3_8E, PENC8_3…,
// the Xilinx-style name drawn)
SYMBOLS.decoder = {
  category: 'Decoders/Encoders', title: 'DECODER', description: 'n:2^n binary decoder (one-hot outputs, all 0 when E = 0; like Xilinx D2_4E / D3_8E / D4_16E)',
  params: [{ name: 'n', label: 'Address bits', kind: 'int', default: 2, min: 1, max: 5 },
    { name: 'en', label: 'Enable input E', kind: 'bool', default: true },
    { name: 'bus', label: 'Bus pins (A, D)', kind: 'bool', default: false }],
};
SYMBOLS.encoder = {
  category: 'Decoders/Encoders', title: 'ENCODER', description: '2^n:n binary encoder: priority (highest active input wins) or one-hot (OR of the inputs); V = some input is 1',
  params: [{ name: 'n', label: 'Output bits', kind: 'int', default: 2, min: 2, max: 5 },
    { name: 'mode', label: 'Type', kind: 'select', options: ['priority', 'one-hot'], default: 'one-hot' },
    { name: 'bus', label: 'Bus pins (I, A)', kind: 'bool', default: false }],
};
SYMBOLS.add = {
  category: 'Arithmetic', title: 'ADD', description: 'Adder S = A + B (+ CI), optional carry out',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'cin', label: 'Carry in', kind: 'bool', default: false }, { name: 'cout', label: 'Carry out', kind: 'bool', default: false },
    // (#304: the operands' and the sum's bits on pins of their own, A0.., B0.., S0.., as the Xilinx ADD4)
    // (no presets: Width, the carries and Pins per bit make ADD1 / ADD2 / ADD4…, #317)
    { name: 'bits', label: 'Pins per bit (A0.., B0.., S0..)', kind: 'bool', default: false }],
};
// (#322: a borrow in BI and out BO, as ADD's carries, and a pin per bit)
SYMBOLS.sub = { category: 'Arithmetic', title: 'SUB', description: 'Subtractor D = A - B (- BI), optional borrow out',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'bin', label: 'Borrow in (BI)', kind: 'bool', default: false }, { name: 'bout', label: 'Borrow out (BO)', kind: 'bool', default: false },
    { name: 'bits', label: 'Pins per bit (A0.., B0.., D0..)', kind: 'bool', default: false }] };
// an adder's / subtractor's names: its result, its carry or borrow in and out, and whether they are there
export const arithIo = (t, p) => (t === 'sub' ? { o: 'D', ci: 'BI', co: 'BO', cin: !!p.bin, cout: !!p.bout, op: '-' } : { o: 'S', ci: 'CI', co: 'CO', cin: !!p.cin, cout: !!p.cout, op: '+' });
SYMBOLS.compare = {
  category: 'Arithmetic', title: 'COMP', description: 'Comparator O = A <op> B',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'op', label: 'Operation', kind: 'select', options: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'], default: 'eq' },
    { name: 'signed', label: 'Signed', kind: 'bool', default: false },
    // (#319: A0.. and B0.., as ADD's)
    { name: 'bits', label: 'Pins per bit (A0.., B0..)', kind: 'bool', default: false }],
};
SYMBOLS.constant = {
  category: 'General', title: 'CONSTANT', description: 'Constant value (decimal, 0x.. hex or 0b.. binary)',
  params: [{ name: 'value', label: 'Value', kind: 'text', default: '0' }, { ...P_WIDTH, default: 1 }],
};
SYMBOLS.vcc = { category: 'General', title: 'VCC', description: 'Logic 1 (all bits)', params: [] };
SYMBOLS.gnd = { category: 'General', title: 'GND', description: 'Logic 0 (all bits)', params: [] };
// Flip-flops of the Xilinx Unified Libraries (FT* / FJK* plus a plain FT / FJK, which Xilinx does not have).
// ff: { k: 'd'|'t'|'jk', ce, clr, pre (asynchronous; CLR wins over PRE), r, s (synchronous; R wins over S unless sp) }.
// Priorities as in the Xilinx Libraries Guide: CLR > PRE > clock; R > S > CE (FDSE/FTSRE/FJKSRE: S > R > CE).
const FF_KIND = { d: ['D', 'D'], t: ['T', 'toggle (T)'], jk: ['JK', 'J-K'] };
function ffSym(name, k, f, title) {
  const parts = [];
  if (f.ce) parts.push('clock enable');
  if (f.clr) parts.push('asynchronous clear');
  if (f.pre) parts.push('asynchronous preset');
  if (f.r && f.s) parts.push(f.sp ? 'synchronous set and reset (S over R)' : 'synchronous reset and set (R over S)');
  else if (f.r) parts.push('synchronous reset');
  else if (f.s) parts.push('synchronous set');
  const desc = `${FF_KIND[k][1]} flip-flop${parts.length ? ` with ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}` : ''}`;
  // Xilinx INIT default: 1 for the preset / set types (FDP, FDS, FTP, FJKP, FDSE...), 0 otherwise
  const init = (f.pre && !f.clr) || (f.s && (!f.r || f.sp)) ? '1' : '0';
  // (INIT first: the Xilinx default; Width: the data inputs and Q, one flip-flop per bit, the controls shared)
  return { category: 'Flip-Flops', title: title || name.toUpperCase(), ff: { k, ...f }, description: `${desc[0].toUpperCase() + desc.slice(1)} (bitwise when Width > 1)`, params: [{ ...P_INIT, default: init }, P_WIDTH] };
}
for (const [k, pfx, list] of [
  ['d', 'fd', ['', 'c', 'ce', 'cp', 'cpe', 'e', 'p', 'pe', 'r', 're', 'rs', 'rse', 's', 'se']],
  ['t', 'ft', ['', 'c', 'ce', 'cp', 'cpe', 'p', 'pe', 'rse', 'sre']],
  ['jk', 'fjk', ['', 'c', 'ce', 'cp', 'cpe', 'p', 'pe', 'rse', 'sre']],
]) for (const x of list) {
  const f = { ce: x.endsWith('e') && x !== '', clr: x[0] === 'c', pre: /^c?p/.test(x), r: /^r|^sr/.test(x), s: /^s|^rs/.test(x), sp: /^sr/.test(x) };
  for (const q of Object.keys(f)) if (!f[q]) delete f[q];
  SYMBOLS[pfx + x] = ffSym(pfx + x, k, f);
  // (the palette lists FD, FT and FJK only: a variant is the basic one with its inputs chosen in the
  // properties, #315)
  if (x) SYMBOLS[pfx + x].hidden = true;
}
// the flip-flop inputs a symbol's properties offer (#315), and the variant a choice of them makes
export const FF_INPUTS = [['ce', 'Clock enable (CE)'], ['clr', 'Asynchronous clear (CLR)'], ['pre', 'Asynchronous preset (PRE)'], ['r', 'Synchronous reset (R)'], ['s', 'Synchronous set (S)']];
const ffKey = f => FF_INPUTS.map(([q]) => (f[q] ? q : '')).join('|');
/** The flip-flop type of kind k (the one of `type`) with exactly the inputs `f` ({ ce, clr, pre, r, s }), or
 *  null when the Xilinx library has none (for R and S both, the one where R wins, else the one where S does). */
export function ffVariant(type, f) {
  const k = SYMBOLS[type]?.ff?.k;
  if (!k) return null;
  const want = ffKey(f);
  const all = Object.entries(SYMBOLS).filter(([, S]) => S.ff?.k === k && ffKey(S.ff) === want);
  return (all.find(([, S]) => !S.ff.sp) || all[0])?.[0] || null;
}
// (not in the palette: a flip-flop with Width > 1 is a register, #315; kept for the schematics that have it)
SYMBOLS.register = {
  category: 'Flip-Flops', title: 'REG', hidden: true, description: 'N-bit register',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'en', label: 'Clock enable', kind: 'bool', default: true },
    { name: 'reset', label: 'Reset', kind: 'select', options: ['none', 'async', 'sync'], default: 'async' },
    { name: 'init', label: 'Reset/INIT value', kind: 'text', default: '0' }],
};
SYMBOLS.counter = {
  category: 'Arithmetic', title: 'CNT', description: 'N-bit binary counter',
  params: [{ ...P_WIDTH, default: 8 }, { name: 'en', label: 'Clock enable', kind: 'bool', default: true },
    { name: 'reset', label: 'Reset', kind: 'select', options: ['none', 'async', 'sync'], default: 'async' },
    { name: 'dir', label: 'Direction', kind: 'select', options: ['up', 'down'], default: 'up' },
    // (#319: Q0.. on pins of their own)
    { name: 'bits', label: 'Pins per bit (Q0..)', kind: 'bool', default: false }],
};
SYMBOLS.slice = {
  category: 'Bus', title: 'BUS TAP', description: 'Select bits I(msb downto lsb) of a bus',
  params: [{ name: 'msb', label: 'MSB index', kind: 'int', default: 0, min: 0 }, { name: 'lsb', label: 'LSB index', kind: 'int', default: 0, min: 0 }],
};
SYMBOLS.busjoin = {
  category: 'Bus', title: 'BUS JOIN', description: 'Concatenate inputs (I0 is the most significant part)',
  params: [{ name: 'widths', label: 'Input widths (MSB first)', kind: 'text', default: '1,1' }],
};
SYMBOLS.module = { category: 'Project modules', title: 'MODULE', description: 'Instance of a project module/entity', params: [] };
SYMBOLS.hdlblock = {
  category: 'Logic', title: 'HDL BLOCK', description: 'Box with explicit pins carrying HDL statements emitted verbatim',
  params: [],
};

// the device primitives (#791, core/primitives.js): the block RAMs, multipliers / DSP slices, clock managers and
// clock buffers of the project's family (`families`: the palette offers a symbol for these only), each the UNISIM
// primitive instanced as it is; their attributes (the generics) the symbol's parameters, named as the primitive's
const ATTR_KIND = { int: 'int', string: 'select', bool: 'bool', hex: 'text' };
/** The parameter of a primitive's symbol for its attribute g (core/primitives.js). */
export function attrParam(g) {
  const kind = g.kind === 'real' ? (g.options ? 'select' : 'text') : ATTR_KIND[g.kind];
  const note = g.kind === 'hex' ? `${g.bits} bits, hexadecimal` : g.kind === 'int' || (g.kind === 'real' && !g.options) ? `${g.min} … ${g.max}` : null;
  return { name: g.name, label: g.name, kind, default: g.default, attr: true, ...(g.options ? { options: [...g.options] } : {}),
    ...(g.kind === 'int' ? { min: g.min, max: g.max } : {}), ...(note ? { note } : {}) };
}
for (const [type, P] of Object.entries(DEVICE_PRIMITIVES)) {
  const p0 = {};
  for (const x of P.params || []) p0[x.name] = x.default;
  SYMBOLS[type] = { category: 'Device Primitives', title: P.title, prim: true, families: [...P.families], description: P.description,
    params: [...(P.params || []).map(x => ({ ...x })), ...P.of(p0).generics.map(attrParam)] };
}

/** The parameters of a placed symbol: its library's, a device primitive's attributes at its parameters (an INIT of
 *  the width its port has, #791). */
export function symbolParams(sym) {
  const S = SYMBOLS[sym?.type];
  if (!S?.prim) return S?.params || [];
  const own = DEVICE_PRIMITIVES[sym.type].params || [];
  return [...own, ...primitiveOf(sym.type, { ...defaultParams(sym.type), ...(sym.params || {}) }).generics.map(attrParam)];
}

export const SYMBOL_CATEGORIES = ['Logic', 'Tri-State', 'Arithmetic', 'Flip-Flops', 'Mux', 'Decoders/Encoders', 'Bus', 'General', 'Device Primitives', 'Project modules'];

export function defaultParams(type) {
  const s = SYMBOLS[type];
  const p = {};
  for (const d of s?.params || []) p[d.name] = d.default;
  if (type === 'hdlblock') { p.inputs = [{ name: 'a', width: 1 }]; p.outputs = [{ name: 'y', width: 1 }]; p.title = 'logic'; }
  if (type === 'module') { p.module = ''; p.generics = {}; }
  return p;
}

export const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const widthsOf = s => String(s ?? '').split(/[,\s]+/).map(x => int(x, 0)).filter(x => x > 0);
const chW = 6.2;   // approx char width of 9-11px Arial used for sizing boxes

export function normModules(modules) {
  const out = {};
  if (!modules) return out;
  const list = Array.isArray(modules) ? modules : Object.values(modules);
  for (const m of list) if (m && m.name) out[m.name] = m;
  return out;
}
export function findMod(modules, name) {
  if (!name) return null;
  if (modules[name]) return modules[name];
  const ln = name.toLowerCase();
  for (const k in modules) if (k.toLowerCase() === ln) return modules[k];
  return null;
}

function boxDef(west, east, title, minW = 80, top = 20) {
  const rows = Math.max(west.length, east.length, 1);
  const lw = Math.max(0, ...west.map(p => String(p.name).length * chW + (p.clock ? 8 : 0)));
  const rw = Math.max(0, ...east.map(p => String(p.name).length * chW));
  const bw = r10(Math.max(minW, lw + rw + 24, String(title || '').length * 7 + 16));
  const w = bw + 40, h = rows * 20 + top;
  const pins = [];
  west.forEach((p, i) => pins.push({ ...p, x: 0, y: top + i * 20, side: 'W' }));
  east.forEach((p, i) => pins.push({ ...p, x: w, y: top + i * 20, side: 'E' }));
  return { w, h, body: { x: 20, y: 0, w: bw, h }, pins };
}

// The type name drawn on a symbol: its library title, with its width for the symbols whose width is part of
// the Xilinx name (ADD8, SUB16, COMP4, CNT8, REG8, #681)
const WIDE_NAMED = new Set(['add', 'sub', 'compare', 'register', 'counter']);
export function symbolTypeName(sym) {
  const nm = SYMBOLS[sym.type]?.title || String(sym.type || '').toUpperCase();
  if (!WIDE_NAMED.has(sym.type)) return nm;
  const p = { ...defaultParams(sym.type), ...(sym.params || {}) };
  return `${nm}${Math.max(1, int(p.width, 1))}`;
}

// Local (unrotated) geometry of a symbol: { w, h, shape, body, pins: [{ name, dir, x, y, side, width }] }.
// width null = takes the width of the net it is connected to.
export function symbolDef(sym, modules = {}) {
  const t = sym.type, p = { ...defaultParams(t), ...(sym.params || {}) };
  const S = SYMBOLS[t];
  const W = Math.max(1, int(p.width, 1));
  if (S && S.gate && S.inputs > 1) {
    const n = S.inputs, h = Math.max(40, n * 20);
    const pins = [];
    const k = S.invIn || 0;
    // inverted-input gates follow the Xilinx library drawing: I0 at the bottom, bubbles on I0..I(k-1)
    for (let i = 0; i < n; i++) {
      const q = { name: `I${i}`, dir: 'in', x: 0, y: k ? h / 2 + (n - 1) * 10 - 20 * i : h / 2 - (n - 1) * 10 + 20 * i, side: 'W', width: W };
      if (i < k) q.inv = true;
      pins.push(q);
    }
    pins.push({ name: 'O', dir: 'out', x: 80, y: h / 2, side: 'E', width: W });
    return { w: 80, h, shape: 'gate', gate: S.gate, bubble: /^n|xnor/.test(S.gate), body: { x: 20, y: 0, w: 40, h }, pins };
  }
  if (t === 'inv' || t === 'buf') {
    return { w: 60, h: 20, shape: t, body: { x: 20, y: 0, w: 24, h: 20 },
      pins: [{ name: 'I', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'O', dir: 'out', x: 60, y: 10, side: 'E', width: W }] };
  }
  if (t === 'tbuf') {
    // the enable on the left, one row above the data (as the Xilinx BUFE / BUFT symbols); one triangle per
    // bit when the bits have their own pins (BUFE4 / BUFT4), the enable line joining their top edges
    const en = p.enable === 'T' ? 'T' : 'E', bits = W > 1 && !!p.bits, n = bits ? W : 1;
    const pins = [{ name: en, dir: 'in', x: 0, y: 10, side: 'W', width: 1 }];
    for (let k = 0; k < n; k++) pins.push({ name: bits ? `I${k}` : 'I', dir: 'in', x: 0, y: 30 + 20 * k, side: 'W', width: bits ? 1 : W });
    for (let k = 0; k < n; k++) pins.push({ name: bits ? `O${k}` : 'O', dir: 'out', x: 60, y: 30 + 20 * k, side: 'E', width: bits ? 1 : W, tri: true });
    const title = `BUF${en}${W > 1 ? W : ''}`;
    return { w: 60, h: 20 + 20 * n, shape: 'tbuf', activeLow: en === 'T', rows: n, title, body: { x: 20, y: 20, w: 26, h: 20 * n }, pins };
  }
  // the select pins at the bottom, the most significant on the left, 20 apart around cx (#301): one bus pin S
  // (selBus) or S<k-1> … S0
  const selPins = (k, cx, h) => (k === 1 ? [{ name: 'S0', dir: 'in', x: cx, y: h, side: 'S', width: 1 }]
    : p.selBus ? [{ name: 'S', dir: 'in', x: cx, y: h, side: 'S', width: k }]
      : [...Array(k).keys()].map(i => ({ name: `S${k - 1 - i}`, dir: 'in', x: cx - 10 * (k - 1) + 20 * i, y: h, side: 'S', width: 1 })));
  if (MUX_INPUTS[t]) {
    // (the enable E: a data row more, on the left below the data inputs, as the Xilinx M2_1E … M16_1E)
    // (the body wider with the select bits, 20 apart: 40 for M2_1 / M4_1, 60 for M8_1, 80 for M16_1)
    const n = MUX_INPUTS[t], k = Math.log2(n), en = !!p.en, bh = n * 20 + 20 + (en ? 20 : 0), h = bh + 10, bw = Math.max(40, 20 * k);
    const pins = [];
    for (let i = 0; i < n; i++) pins.push({ name: `D${i}`, dir: 'in', x: 0, y: 20 + 20 * i, side: 'W', width: W });
    if (en) pins.push({ name: 'E', dir: 'in', x: 0, y: 20 + 20 * n, side: 'W', width: 1 });
    pins.push(...selPins(k, 20 + bw / 2, h));
    pins.push({ name: 'O', dir: 'out', x: bw + 40, y: bh / 2, side: 'E', width: W });
    return { w: bw + 40, h, shape: 'mux', title: `M${n}_1${en ? 'E' : ''}`, body: { x: 20, y: 0, w: bw, h: bh }, pins };
  }
  if (t === 'demux') {
    // trapezoid wide on the output side (mirror of M2_1/M4_1), 70 px wide so that the pin names fit inside
    // (the enable E: on the left, below D, the body a row taller)
    const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k, bh = n * 20 + 40 + (p.en ? 20 : 0), h = bh + 10;   // a free row at the bottom for S
    const pins = [{ name: 'D', dir: 'in', x: 0, y: bh / 2, side: 'W', width: W }];
    if (p.en) pins.push({ name: 'E', dir: 'in', x: 0, y: bh - 30, side: 'W', width: 1 });
    pins.push(...selPins(k, 60, h));
    for (let i = 0; i < n; i++) pins.push({ name: `O${i}`, dir: 'out', x: 110, y: 20 + 20 * i, side: 'E', width: W });
    return { w: 110, h, shape: 'demux', title: `DEMUX1_${n}${p.en ? 'E' : ''}`, body: { x: 20, y: 0, w: 70, h: bh }, pins };
  }
  if (t === 'decoder' || t === 'encoder') {
    const west = [], east = [];
    let title;
    if (t === 'decoder') {
      const n = Math.max(1, Math.min(5, int(p.n, 2))), o = 1 << n;
      if (p.bus) west.push({ name: 'A', dir: 'in', width: n }); else for (let i = 0; i < n; i++) west.push({ name: `A${i}`, dir: 'in', width: 1 });
      if (p.en) west.push({ name: 'E', dir: 'in', width: 1 });
      if (p.bus) east.push({ name: 'D', dir: 'out', width: o }); else for (let i = 0; i < o; i++) east.push({ name: `D${i}`, dir: 'out', width: 1 });
      title = `D${n}_${o}${p.en ? 'E' : ''}`;
    } else {
      const n = Math.max(2, Math.min(5, int(p.n, 2))), m = 1 << n;
      if (p.bus) west.push({ name: 'I', dir: 'in', width: m }); else for (let i = 0; i < m; i++) west.push({ name: `I${i}`, dir: 'in', width: 1 });
      if (p.bus) east.push({ name: 'A', dir: 'out', width: n }); else for (let i = 0; i < n; i++) east.push({ name: `A${i}`, dir: 'out', width: 1 });
      east.push({ name: 'V', dir: 'out', width: 1 });
      title = `${p.mode === 'one-hot' ? 'ENC' : 'PENC'}${m}_${n}`;
    }
    // a free row on top for the symbol name (drawn like the title of module symbols), pins below it
    const d = boxDef(west, east, title, 80, 40);
    return { ...d, shape: 'lib', title };
  }
  if ((t === 'add' || t === 'sub') && p.bits && W > 1) {
    // (#304, #322) a box as the Xilinx ADD4: A0.. B0.. (CI / BI) on the left, S0.. / D0.. (CO / BO) on the right
    const io = arithIo(t, p), west = [], east = [];
    for (const g of ['A', 'B']) for (let i = 0; i < W; i++) west.push({ name: `${g}${i}`, dir: 'in', width: 1 });
    if (io.cin) west.push({ name: io.ci, dir: 'in', width: 1 });
    for (let i = 0; i < W; i++) east.push({ name: `${io.o}${i}`, dir: 'out', width: 1 });
    if (io.cout) east.push({ name: io.co, dir: 'out', width: 1 });
    const title = `${t === 'sub' ? 'SUB' : 'ADD'}${W}`;
    return { ...boxDef(west, east, title, 80, 40), shape: 'lib', title };
  }
  if (t === 'compare' && p.bits && W > 1) {
    // (#319) a box: A0.. B0.. on the left, O on the right, its relation in its name
    const west = [];
    for (const g of ['A', 'B']) for (let i = 0; i < W; i++) west.push({ name: `${g}${i}`, dir: 'in', width: 1 });
    const title = `COMP${W} ${({ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' })[p.op] || '?'}`;
    return { ...boxDef(west, [{ name: 'O', dir: 'out', width: 1 }], title, 80, 40), shape: 'lib', title };
  }
  if (t === 'add' || t === 'sub' || t === 'compare') {
    const h = t === 'compare' ? 40 : 60;
    const pins = [{ name: 'A', dir: 'in', x: 0, y: 10, side: 'W', width: W }, { name: 'B', dir: 'in', x: 0, y: 30, side: 'W', width: W }];
    const io = t === 'compare' ? null : arithIo(t, p);
    if (io?.cin) pins.push({ name: io.ci, dir: 'in', x: 0, y: 50, side: 'W', width: 1 });
    if (t === 'compare') pins.push({ name: 'O', dir: 'out', x: 80, y: 20, side: 'E', width: 1 });
    else pins.push({ name: io.o, dir: 'out', x: 80, y: 30, side: 'E', width: W });
    if (io?.cout) pins.push({ name: io.co, dir: 'out', x: 80, y: 50, side: 'E', width: 1 });
    const op = t === 'add' ? '+' : t === 'sub' ? '−' : ({ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[p.op] || '?');
    return { w: 80, h, shape: 'arith', op, body: { x: 20, y: 0, w: 40, h }, pins };
  }
  if (S && (S.ff || t === 'register' || t === 'counter')) {
    let ce, clr, pre, r, st, west = [];
    const f = S.ff;
    if (f) ({ ce, clr, pre, r, s: st } = f);
    else { ce = !!p.en; clr = p.reset === 'async'; r = p.reset === 'sync'; }
    const bw = W;   // (a library flip-flop: Width bits of data and Q, the controls 1 bit)
    // ISE order: PRE / S on top, data, CE, C, CLR / R at the bottom; Q level with the (first) data input
    if (pre) west.push({ name: 'PRE', dir: 'in', width: 1 });
    if (st) west.push({ name: 'S', dir: 'in', width: 1 });
    const q0 = west.length;
    if (f?.k === 't') west.push({ name: 'T', dir: 'in', width: bw });
    else if (f?.k === 'jk') west.push({ name: 'J', dir: 'in', width: bw }, { name: 'K', dir: 'in', width: bw });
    else if (t !== 'counter') west.push({ name: 'D', dir: 'in', width: bw });
    if (ce) west.push({ name: 'CE', dir: 'in', width: 1 });
    west.push({ name: 'C', dir: 'in', width: 1, clock: true });
    if (clr) west.push({ name: 'CLR', dir: 'in', width: 1 });
    if (r) west.push({ name: 'R', dir: 'in', width: 1 });
    const h = Math.max(40, west.length * 20 + 10);   // bottom margin: the type name sits under the last pin name
    const pins = west.map((q, i) => ({ ...q, x: 0, y: 10 + 20 * i, side: 'W' }));
    // (a counter with a pin per bit, #319: Q0 .. Q<w-1>)
    if (t === 'counter' && p.bits && W > 1) {
      for (let i = 0; i < W; i++) pins.push({ name: `Q${i}`, dir: 'out', x: 90, y: 10 + 20 * i, side: 'E', width: 1 });
      const hb = Math.max(h, W * 20 + 10);
      return { w: 90, h: hb, shape: 'ff', body: { x: 20, y: 0, w: 50, h: hb }, pins };
    }
    pins.push({ name: 'Q', dir: 'out', x: 90, y: 10 + 20 * (t === 'counter' ? 0 : q0), side: 'E', width: bw });
    return { w: 90, h, shape: 'ff', body: { x: 20, y: 0, w: 50, h }, pins };
  }
  if (t === 'slice') {
    const msb = int(p.msb, 0), lsb = int(p.lsb, 0);
    return { w: 40, h: 20, shape: 'slice', text: msb === lsb ? `(${msb})` : `(${msb}:${lsb})`, body: { x: 15, y: 0, w: 10, h: 20 },
      pins: [{ name: 'I', dir: 'in', x: 0, y: 10, side: 'W', width: p.inWidth ? int(p.inWidth, null) : null },
        { name: 'O', dir: 'out', x: 40, y: 10, side: 'E', width: Math.abs(msb - lsb) + 1 }] };
  }
  if (t === 'busjoin') {
    const ws = widthsOf(p.widths);
    const n = Math.max(1, ws.length), h = n * 20;
    const pins = ws.map((w, i) => ({ name: `I${i}`, dir: 'in', x: 0, y: 10 + 20 * i, side: 'W', width: w }));
    pins.push({ name: 'O', dir: 'out', x: 40, y: h / 2, side: 'E', width: ws.reduce((a, b) => a + b, 0) || null });
    return { w: 40, h, shape: 'join', body: { x: 18, y: 0, w: 4, h }, pins };
  }
  if (t === 'constant') {
    const txt = String(p.value ?? '0');
    const w = r10(Math.max(40, txt.length * 7 + 24));
    return { w, h: 20, shape: 'const', text: txt, body: { x: 0, y: 0, w: w - 20, h: 20 },
      pins: [{ name: 'O', dir: 'out', x: w, y: 10, side: 'E', width: W }] };
  }
  if (t === 'vcc') return { w: 20, h: 30, shape: 'vcc', body: { x: 0, y: 0, w: 20, h: 10 }, pins: [{ name: 'P', dir: 'out', x: 10, y: 30, side: 'S', width: null }] };
  if (t === 'gnd') return { w: 20, h: 30, shape: 'gnd', body: { x: 0, y: 20, w: 20, h: 10 }, pins: [{ name: 'G', dir: 'out', x: 10, y: 0, side: 'N', width: null }] };
  if (t === 'module') {
    const m = findMod(modules, p.module);
    let ports = m ? m.ports : (p.ports || []);
    const snapW = new Map((p.ports || []).map(q => [String(q.name).toLowerCase(), q.width]));
    const overridden = p.generics && Object.keys(p.generics).length > 0;
    ports = ports.map(q => ({ name: q.name, dir: q.dir || 'in', width: (overridden && snapW.has(String(q.name).toLowerCase())) ? snapW.get(String(q.name).toLowerCase()) : (q.width ?? 1), type: q.type }));
    const d = boxDef(ports.filter(q => q.dir !== 'out'), ports.filter(q => q.dir === 'out'), p.module, 80);
    return { ...d, shape: 'module', title: p.module || '?', missing: !m && !p.ports };
  }
  if (S?.prim) {
    // (a box: the inputs on the left, the outputs on the right, in the order of UNISIM's ports; the name of the
    // primitive its parameters make on top, RAMB16_S9_S18)
    const r = primitiveOf(t, p);
    const pinOf = q => ({ name: q.name, dir: q.dir, width: q.width, ...(q.clock ? { clock: true } : {}), ...(q.dir === 'in' ? { tie: q.tie, need: q.need } : {}) });
    const d = boxDef(r.pins.filter(q => q.dir !== 'out').map(pinOf), r.pins.filter(q => q.dir === 'out').map(pinOf), r.name, 100, 40);
    return { ...d, shape: 'lib', title: r.name, prim: r.name };
  }
  if (t === 'hdlblock') {
    const ins = (p.inputs || []).map(q => ({ name: q.name, dir: q.dir === 'inout' ? 'inout' : 'in', width: Math.max(1, int(q.width, 1)), clock: !!q.clock }));
    const outs = (p.outputs || []).map(q => ({ name: q.name, dir: 'out', width: Math.max(1, int(q.width, 1)), reg: !!q.reg }));
    const d = boxDef(ins, outs, p.title, 100);
    return { ...d, shape: 'hdl', title: p.title || 'HDL' };
  }
  // unknown symbol type: an empty box so the document still loads
  return { w: 60, h: 40, shape: 'unknown', body: { x: 10, y: 0, w: 40, h: 40 }, pins: [] };
}

const ROT_OK = new Set([0, 90, 180, 270]);
export function rotSize(sym, def) { return (sym.rot === 90 || sym.rot === 270) ? { w: def.h, h: def.w } : { w: def.w, h: def.h }; }

// local symbol coordinates -> sheet coordinates
export function xform(sym, def, x, y) {
  let px = sym.mirror ? def.w - x : x, py = y;
  switch (sym.rot) {
    case 90: [px, py] = [def.h - py, px]; break;
    case 180: [px, py] = [def.w - px, def.h - py]; break;
    case 270: [px, py] = [py, def.w - px]; break;
  }
  return { x: sym.x + px, y: sym.y + py };
}
export const SIDE_V = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
export function xformSide(sym, side) {
  let [dx, dy] = SIDE_V[side] || [-1, 0];
  if (sym.mirror) dx = -dx;
  switch (sym.rot) {
    case 90: [dx, dy] = [-dy, dx]; break;
    case 180: [dx, dy] = [-dx, -dy]; break;
    case 270: [dx, dy] = [dy, -dx]; break;
  }
  return dx < 0 ? 'W' : dx > 0 ? 'E' : dy < 0 ? 'N' : 'S';
}

// pins in sheet coordinates
export function symbolPins(sym, modules = {}, def = symbolDef(sym, modules)) {
  return def.pins.map(p => ({ ...p, ...xform(sym, def, p.x, p.y), side: xformSide(sym, p.side), lx: p.x, ly: p.y }));
}
export function symbolBox(sym, modules = {}, def = symbolDef(sym, modules)) {
  const { w, h } = rotSize(sym, def);
  return { x: sym.x, y: sym.y, w, h };
}

// I/O marker geometry: the connection point is (x, y); the body extends to its side (portSide): to the
// left by default for an input, to the right for an output or a bidirectional port, or up or down (#296)
export const PORT_SIDES = ['W', 'N', 'E', 'S'];   // clockwise
export const portSide = port => (PORT_SIDES.includes(port.side) ? port.side : port.dir === 'in' ? 'W' : 'E');
// a quarter turn clockwise; the opposite side (Mirror)
export const turnSide = side => PORT_SIDES[(PORT_SIDES.indexOf(side) + 1) % 4];
export const oppositeSide = side => PORT_SIDES[(PORT_SIDES.indexOf(side) + 2) % 4];
// the default name of an I/O marker placed on empty space (no net to name it, #680): in1, out1, io1…, the
// first not taken by a marker, a net name or an instance (case-insensitive, as VHDL compares them)
export function freePortName(doc, dir) {
  const base = dir === 'out' ? 'out' : dir === 'inout' ? 'io' : 'in';
  const taken = new Set([...(doc.ports || []).map(p => p.name), ...(doc.labels || []).map(l => parseNetName(l.net).base), ...(doc.symbols || []).map(s => s.name)]
    .filter(Boolean).map(s => String(s).toLowerCase()));
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}
export function portBox(port) {
  const tw = Math.max(20, String(port.name || '').length * 7.5);
  const w = r10(tw + 34);
  switch (portSide(port)) {
    case 'W': return { x: port.x - w, y: port.y - 10, w, h: 20 };
    case 'N': return { x: port.x - 10, y: port.y - w, w: 20, h: w };
    case 'S': return { x: port.x - 10, y: port.y, w: 20, h: w };
    default: return { x: port.x, y: port.y - 10, w, h: 20 };
  }
}

// ===================================================================== documents
export function newDoc(name = 'schematic', lang = 'vhdl') {
  return { version: DOC_VERSION, name, lang, sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [], ports: [] };
}

// (modules: the project's modules, the pins of its module symbols, to convert a document of version 2;
// without them, a document with module symbols stays at version 2, converted when they are known)
export function normalizeDoc(d, { modules } = {}) {
  const doc = d && typeof d === 'object' ? clone(d) : newDoc();
  const before301 = !(+doc.version >= 2);
  const before678 = !(+doc.version >= 3);
  doc.version = DOC_VERSION;
  doc.name = String(doc.name || 'schematic');
  doc.lang = doc.lang === 'verilog' ? 'verilog' : 'vhdl';
  doc.sheet = { w: Math.max(400, +doc.sheet?.w || 1700), h: Math.max(300, +doc.sheet?.h || 1100) };
  const ids = new Set();
  const uid = (o, pfx) => {
    let id = o.id != null ? String(o.id) : '';
    if (!id || ids.has(id)) { let k = ids.size + 1; while (ids.has(`${pfx}${k}`)) k++; id = `${pfx}${k}`; }
    ids.add(id); o.id = id;
  };
  doc.symbols = (Array.isArray(doc.symbols) ? doc.symbols : []).filter(s => s && s.type).map(s => {
    const o = { id: s.id, type: String(s.type), x: snap(+s.x || 0), y: snap(+s.y || 0), rot: ROT_OK.has(+s.rot) ? +s.rot : 0, mirror: !!s.mirror, name: String(s.name ?? ''), params: { ...defaultParams(s.type), ...(s.params || {}) } };
    // a M4_1 / DEMUX saved before its select bits had pins of their own (#301): its bus pin S kept
    if (before301 && (o.type === 'mux4' || o.type === 'demux') && !('selBus' in (s.params || {}))) o.params.selBus = true;
    if (s.hdl != null) o.hdl = String(s.hdl);
    uid(o, 'S'); return o;
  });
  doc.wires = (Array.isArray(doc.wires) ? doc.wires : []).filter(w => w && Array.isArray(w.points) && w.points.length >= 2).map(w => {
    const pts = [];
    for (const p of w.points) { const q = { x: snap(+p.x || 0), y: snap(+p.y || 0) }; const l = pts[pts.length - 1]; if (!l || l.x !== q.x || l.y !== q.y) pts.push(q); }
    const o = { id: w.id, points: pts };
    if (w.bus) o.bus = true;
    uid(o, 'W'); return o;
  }).filter(w => w.points.length >= 2);
  doc.labels = (Array.isArray(doc.labels) ? doc.labels : []).filter(l => l && l.net).map(l => { const o = { id: l.id, x: snap(+l.x || 0), y: snap(+l.y || 0), net: String(l.net).trim() }; uid(o, 'L'); return o; });
  doc.ports = (Array.isArray(doc.ports) ? doc.ports : []).filter(p => p && p.name).map(p => {
    const o = { id: p.id, name: String(p.name).trim(), dir: ['in', 'out', 'inout'].includes(p.dir) ? p.dir : 'in', width: Math.max(1, int(p.width, 1)), x: snap(+p.x || 0), y: snap(+p.y || 0) };
    if (p.type) o.type = String(p.type);
    // (its side when it is not the default one, #296)
    if (PORT_SIDES.includes(p.side) && p.side !== portSide({ dir: o.dir })) o.side = p.side;
    // (VHDL, #225: a buffer port, a port's default value, as the module had them)
    if (p.mode === 'buffer') o.mode = 'buffer';
    if (p.default != null && String(p.default).trim()) o.default = String(p.default).trim();
    uid(o, 'P'); return o;
  });
  // names for symbols without one
  const names = new Set(doc.symbols.map(s => s.name).filter(Boolean));
  let k = 0;
  for (const s of doc.symbols) if (!s.name) { do k++; while (names.has(`U${k}`)); s.name = `U${k}`; names.add(s.name); }
  if (doc.hdl && typeof doc.hdl !== 'object') delete doc.hdl;
  delete doc.importDiagnostics;
  if (before678) {
    const mods = normModules(modules);
    joinOnWires(doc, mods);
    if (doc.symbols.some(s => symbolDef(s, mods).missing)) doc.version = 2;
  }
  return doc;
}

// ISE style bus names: "data(7:0)" / "data[7:0]" -> { base: 'data', width: 8 }
export function parseNetName(s) {
  const m = /^\s*([A-Za-z_][\w$]*)\s*(?:[([]\s*(\d+)\s*(?::|downto|to)\s*(\d+)\s*[)\]])?\s*$/i.exec(String(s ?? ''));
  if (!m) return { base: String(s ?? '').trim(), width: null, bad: true };
  return { base: m[1], width: m[2] != null ? Math.abs(+m[2] - +m[3]) + 1 : null };
}

// The net, other than `except`, that a net name would join (#689): net names (labels) and I/O markers of
// the same name are one net, connected by name without a wire, as in ISE (case-insensitive in VHDL). The
// name's base counts (d(7:0): d). nl: netlist(doc). Returns that net, or null.
export function netByName(doc, nl, name, except = null) {
  const ci = doc.lang !== 'verilog';
  const nk = v => (ci ? String(v).toLowerCase() : String(v));
  const base = nk(parseNetName(name).base);
  if (!base) return null;
  const label = new Map(doc.labels.map(l => [l.id, l]));
  const port = new Map(doc.ports.map(p => [p.id, p]));
  return nl.nets.find(n => n !== except && n.id !== except?.id && (
    n.labels.some(id => nk(parseNetName(label.get(id)?.net).base) === base) || n.ports.some(id => nk(port.get(id)?.name) === base))) || null;
}

// A net connected by name renamed as a whole (#734): every net name (label) and I/O marker of the net that has its
// old name (its base, case-insensitive in VHDL) takes the new one, each label keeping its own bus range
// (d(7:0) -> q(7:0)); the label edited (`edited`, its id) takes the name as typed. A marker is a port of the
// module: renamed too. nl: netlist(doc); net: the net of nl. Returns { labels, ports } (the ones renamed).
export function renameNet(doc, nl, net, name, edited = null) {
  const ci = doc.lang !== 'verilog';
  const nk = v => (ci ? String(v).toLowerCase() : String(v));
  const to = parseNetName(name);
  const out = { labels: [], ports: [] };
  if (!net || to.bad || !to.base) return out;
  const label = new Map(doc.labels.map(l => [l.id, l]));
  const old = edited && label.get(edited) ? parseNetName(label.get(edited).net).base
    : net.labels.map(id => parseNetName(label.get(id)?.net).base).find(Boolean) ?? doc.ports.find(p => net.ports.includes(p.id))?.name ?? net.name;
  const same = v => !!v && nk(v) === nk(old);
  for (const id of net.labels) {
    const l = label.get(id);
    if (!l) continue;
    if (id === edited) { l.net = String(name).trim(); out.labels.push(l); continue; }
    const m = /^\s*([A-Za-z_][\w$]*)(.*)$/s.exec(String(l.net));
    if (!m || !same(m[1])) continue;
    l.net = `${to.base}${m[2].trim() ? m[2].trim() : ''}`;
    out.labels.push(l);
  }
  for (const p of doc.ports) if (net.ports.includes(p.id) && same(p.name)) { p.name = to.base; out.ports.push(p); }
  return out;
}

// Two named nets shorted (#754): nets of `before`, each with a name of its own (a net name or an I/O marker),
// that are one net in `after` (a wire drawn between them). ISE's schematic editor refuses such a wire ("Wire
// would create a short between net x and net y"). Not a short: the same name (connected by name), an unnamed
// net, output markers on another marker's net (assigned in the HDL, y <= a), nor names one net of `before`
// already had. Returns the two names [x, y], or null.
export function netShort(before, after, { modules = {} } = {}) {
  const b = netlist(before, { modules }), a = netlist(after, { modules });
  const names = (doc, n) => {
    const ci = doc.lang === 'vhdl', out = new Map();
    const add = (name, marker, dir) => { const k = ci ? name.toLowerCase() : name; if (name && !out.has(k)) out.set(k, { key: k, name, marker, dir }); };
    for (const id of n.labels) add(parseNetName(doc.labels.find(l => l.id === id)?.net).base, false);
    for (const id of n.ports) { const p = doc.ports.find(q => q.id === id); if (p) add(p.name, true, p.dir); }
    return [...out.values()];
  };
  const owner = new Map();   // a name of `before` -> its net (names alike are one net)
  for (const n of b.nets) for (const x of names(before, n)) owner.set(x.key, n.id);
  for (const n of a.nets) {
    const xs = names(after, n);
    if (xs.length < 2 || (xs.every(x => x.marker) && xs.filter(x => x.dir !== 'out').length <= 1)) continue;
    const by = new Map();
    for (const x of xs) { const g = owner.get(x.key) ?? `new:${x.key}`; if (!by.has(g)) by.set(g, x.name); }
    if (by.size > 1) return [...by.values()].slice(0, 2);
  }
  return null;
}

// ===================================================================== connectivity
export const key = (x, y) => `${x},${y}`;
export function onSeg(p, a, b) {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}

class DSU {
  constructor() { this.p = new Map(); }
  find(a) { let r = a; while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r); let c = a; while (c !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; } if (!this.p.has(r)) this.p.set(r, r); return r; }
  union(a, b) { const x = this.find(a), y = this.find(b); if (x !== y) this.p.set(y, x); }
}

// Connectivity extraction. Returns { nets, pinNet: Map('symId/pin' -> net), portNet: Map(portId -> net),
// wireNet: Map(wireId -> net), junctions: [{x,y}], diagnostics: [{ severity, message, ref: {kind,id,pin?}, x, y }] }.
// net = { id, name, auto, width, endpoints: [{ kind:'pin', sym, pin, dir, width } | { kind:'port', port, dir, width }],
//         wires: [ids], labels: [ids], ports: [ids], drivers: [endpoints] }
export function netlist(docIn, { modules = {} } = {}) {
  modules = normModules(modules);
  const doc = docIn && +docIn.version >= 3 ? docIn : normalizeDoc(docIn, { modules });
  const ci = doc.lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  // a signal declared in the HDL kept in the schematic (its declarations, a schematic made from HDL)
  let declSet = null;
  const declaredHere = name => { if (!String(doc.hdl?.decls || '').trim()) return false; declSet ||= declaredIn(doc.hdl.decls, doc.hdl.lang || doc.lang); return declSet.has(nk(name)); };
  const diags = [];
  const dsu = new DSU();
  const at = new Map();   // point key -> node ids touching (pins, ports, wire vertices)
  const addAt = (x, y, id) => { const k = key(x, y); let a = at.get(k); if (!a) at.set(k, a = []); a.push(id); };

  const symById = new Map(doc.symbols.map(s => [s.id, s]));
  const pinInfo = new Map();     // node id -> endpoint
  const defs = new Map();
  for (const s of doc.symbols) {
    const def = symbolDef(s, modules);
    defs.set(s.id, def);
    for (const p of symbolPins(s, modules, def)) {
      const id = `p:${s.id}/${p.name}`;
      pinInfo.set(id, { kind: 'pin', sym: s.id, pin: p.name, dir: p.dir, width: p.width, x: p.x, y: p.y, ...(p.tri ? { tri: true } : {}) });
      dsu.find(id);
      addAt(p.x, p.y, id);
    }
    if (def.missing) diags.push({ severity: 'error', message: `${s.name}: module '${s.params.module}' not found in the project`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y });
  }
  for (const p of doc.ports) {
    const id = `o:${p.id}`;
    pinInfo.set(id, { kind: 'port', port: p.id, dir: p.dir, width: p.width, x: p.x, y: p.y, name: p.name });
    dsu.find(id);
    addAt(p.x, p.y, id);
  }
  // wires: their end points touch what is there (#678: not their bends, nor their segments)
  const hseg = new Map(), vseg = new Map(), oseg = [];
  for (const w of doc.wires) {
    const id = `w:${w.id}`;
    dsu.find(id);
    for (const pt of [w.points[0], w.points[w.points.length - 1]]) addAt(pt.x, pt.y, id);
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const seg = { a, b, id };
      if (a.y === b.y) { let l = hseg.get(a.y); if (!l) hseg.set(a.y, l = []); l.push(seg); }
      else if (a.x === b.x) { let l = vseg.get(a.x); if (!l) vseg.set(a.x, l = []); l.push(seg); }
      else oseg.push(seg);
    }
  }
  for (const ids of at.values()) for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
  const segsAt = pt => [...(hseg.get(pt.y) || []), ...(vseg.get(pt.x) || []), ...oseg].filter(s => onSeg(pt, s.a, s.b));
  // (a wire ended on another's segment, a pin dropped onto a wire, #170: that wire was split there,
  // splitWiresAt, the joint an end of both; a wire passing over a pin or a wire end does not connect)
  // labels: attach to the wire under them (or a pin/marker at that point)
  const labelOf = new Map();
  for (const l of doc.labels) {
    const id = `l:${l.id}`;
    dsu.find(id);
    const segs = segsAt(l);
    const here = at.get(key(l.x, l.y)) || [];
    if (segs.length) segs.forEach(s => dsu.union(id, s.id));
    else if (here.length) here.forEach(h => dsu.union(id, h));
    else diags.push({ severity: 'warning', message: `net name '${l.net}' is not attached to a wire`, ref: { kind: 'label', id: l.id }, x: l.x, y: l.y });
    const pn = parseNetName(l.net);
    if (pn.bad) diags.push({ severity: 'error', message: `invalid net name '${l.net}'`, ref: { kind: 'label', id: l.id }, x: l.x, y: l.y });
    labelOf.set(id, { label: l, ...pn });
  }
  // same names join (labels and I/O markers)
  const byName = new Map();
  for (const [id, L] of labelOf) { const k = nk(L.base); if (byName.has(k)) dsu.union(byName.get(k), id); else byName.set(k, id); }
  for (const p of doc.ports) { const k = nk(p.name); if (byName.has(k)) dsu.union(byName.get(k), `o:${p.id}`); else byName.set(k, `o:${p.id}`); }

  // groups
  const groups = new Map();
  const all = [...pinInfo.keys(), ...doc.wires.map(w => `w:${w.id}`), ...labelOf.keys()];
  for (const id of all) { const r = dsu.find(id); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(id); }
  const nets = [];
  const pinNet = new Map(), portNet = new Map(), wireNet = new Map(), labelNet = new Map();
  const used = new Set([...doc.ports.map(p => nk(p.name)), ...[...labelOf.values()].map(L => nk(L.base))]);
  let auto = 0;
  const order = doc.symbols.flatMap(s => defs.get(s.id).pins.map(p => `p:${s.id}/${p.name}`));
  const orderIdx = new Map(order.map((id, i) => [id, i]));
  const sorted = [...groups.values()].map(g => {
    const first = Math.min(...g.map(id => orderIdx.get(id) ?? (1e9 + (id.startsWith('w:') ? 0 : 1))));
    return { g, first };
  }).sort((a, b) => a.first - b.first);
  for (const { g } of sorted) {
    const eps = g.filter(id => pinInfo.has(id)).map(id => pinInfo.get(id));
    const wires = g.filter(id => id.startsWith('w:')).map(id => id.slice(2));
    const labels = g.filter(id => id.startsWith('l:')).map(id => labelOf.get(id));
    if (!eps.length && !wires.length && !labels.length) continue;
    const ports = eps.filter(e => e.kind === 'port');
    const net = { id: `N${nets.length + 1}`, name: null, auto: false, width: null, endpoints: eps, wires, labels: labels.map(L => L.label.id), ports: ports.map(e => e.port), drivers: [] };
    // name: I/O marker > label > auto
    const lnames = [...new Set(labels.map(L => L.base))];
    if (ports.length) {
      net.name = ports.find(p => p.dir === 'in')?.name || ports[0].name;
      const bad = lnames.filter(n => nk(n) !== nk(net.name) && !ports.some(p => nk(p.name) === nk(n)));
      if (bad.length) diags.push({ severity: 'warning', message: `net of I/O marker '${net.name}' also named ${bad.map(b => `'${b}'`).join(', ')} (marker name used)`, ref: { kind: 'label', id: labels[0].label.id }, x: labels[0].label.x, y: labels[0].label.y });
    } else if (lnames.length) {
      net.name = lnames.slice().sort()[0];
      if (new Set(lnames.map(nk)).size > 1) diags.push({ severity: 'error', message: `net has several names: ${lnames.join(', ')}`, ref: { kind: 'label', id: labels[0].label.id }, x: labels[0].label.x, y: labels[0].label.y });
    } else {
      do auto++; while (used.has(nk(`net_${auto}`)));
      net.name = `net_${auto}`; net.auto = true;
    }
    // width
    const pinW = eps.filter(e => isNum(e.width));
    const lw = labels.map(L => L.width).filter(isNum);
    const portW = ports.map(p => p.width);
    const cands = [...portW, ...lw, ...pinW.map(e => e.width)];
    const drv = eps.filter(e => (e.kind === 'pin' && e.dir === 'out') || (e.kind === 'port' && e.dir === 'in'));
    net.drivers = drv;
    net.width = portW[0] ?? lw[0] ?? drv.find(e => isNum(e.width))?.width ?? (cands.length ? Math.max(...cands) : (wires.some(id => doc.wires.find(w => w.id === id)?.bus) ? null : 1));
    if (net.width == null) net.width = 1;
    const mism = new Set(cands);
    if (mism.size > 1) {
      const where = pinW.find(e => e.width !== net.width) || eps[0];
      diags.push({ severity: 'error', message: `width mismatch on net '${net.name}': ${[...mism].join(' vs ')} bits`, ref: refOf(where, symById), x: where?.x, y: where?.y, net: net.name });
    }
    const pt = eps[0] || (labels[0] && labels[0].label) || doc.wires.find(w => w.id === wires[0])?.points[0];
    // drivers: tri-state outputs (and bidirectional pins / markers) may share a net, a bus; an ordinary
    // output or an input marker must be its only driver
    const outs = eps.filter(e => e.dir === 'out' && e.kind === 'pin' && !e.tri);
    const ins = eps.filter(e => e.kind === 'port' && e.dir === 'in');
    const tris = eps.filter(e => e.dir === 'out' && e.kind === 'pin' && e.tri);
    if (outs.length + ins.length > 1)
      diags.push({ severity: 'error', message: `net '${net.name}' has ${outs.length + ins.length} drivers (${[...outs, ...ins].map(e => epName(e, symById, doc)).join(', ')})`, ref: refOf(outs[0] || ins[0], symById), x: (outs[0] || ins[0]).x, y: (outs[0] || ins[0]).y, net: net.name });
    else if (outs.length + ins.length === 1 && tris.length) {
      const d = outs[0] || ins[0];
      diags.push({ severity: 'error', message: `net '${net.name}' is driven by ${epName(d, symById, doc)} and by the tri-state output${tris.length > 1 ? 's' : ''} ${tris.map(e => epName(e, symById, doc)).join(', ')}: only tri-state outputs and bidirectional pins may share a net`, ref: refOf(d, symById), x: d.x, y: d.y, net: net.name });
    }
    if (tris.length) net.tristate = true;
    const sinks = eps.filter(e => (e.kind === 'pin' && e.dir !== 'out') || (e.kind === 'port' && e.dir !== 'in'));
    const inouts = eps.filter(e => e.dir === 'inout');
    const isolated = eps.length === 1 && !wires.length && !labels.length;
    if (!drv.length && sinks.length && !inouts.length && !isolated)
      diags.push({ severity: 'warning', message: `net '${net.name}' has no driver (read by ${sinks.map(e => epName(e, symById, doc)).join(', ')})`, ref: refOf(sinks[0], symById), x: sinks[0].x, y: sinks[0].y, net: net.name });
    if (!eps.length) diags.push({ severity: 'warning', message: `dangling wire${wires.length > 1 ? 's' : ''}${labels.length ? ` (net '${net.name}')` : ''} not connected to any pin`, ref: { kind: 'wire', id: wires[0] || '' }, x: pt?.x, y: pt?.y, net: net.name });
    else if (eps.length === 1 && (wires.length || labels.length) && !(labels.length && byNameCount(labels, labelOf, nk) > 0)) {
      const e = eps[0];
      // (not a signal of the HDL kept in the schematic, declared there: that HDL uses it, e.g. a
      // testbench's task reading an instance's output, #225)
      if ((e.kind === 'pin' || !wires.length) && !(labels.length && declaredHere(net.name)))
        diags.push({ severity: 'warning', message: `net '${net.name}' connects only ${epName(e, symById, doc)}`, ref: refOf(e, symById), x: e.x, y: e.y, net: net.name });
    }
    nets.push(net);
    for (const e of eps) { if (e.kind === 'pin') pinNet.set(`${e.sym}/${e.pin}`, net); else portNet.set(e.port, net); }
    for (const w of wires) wireNet.set(w, net);
    for (const L of labels) labelNet.set(L.label.id, net);
  }
  // unconnected pins
  for (const s of doc.symbols) {
    for (const p of defs.get(s.id).pins) {
      const net = pinNet.get(`${s.id}/${p.name}`);
      const alone = !net || net.endpoints.length + net.wires.length + net.labels.length <= 1;
      // (a primitive's input it works without: tied, #791)
      if (alone && p.dir !== 'out' && !(SYMBOLS[s.type]?.prim && !p.need)) {
        const pp = symbolPins(s, modules, defs.get(s.id)).find(q => q.name === p.name);
        diags.push({ severity: s.type === 'module' ? 'warning' : 'warning', message: `input pin ${p.name} of ${s.name} (${s.type === 'module' ? s.params.module : SYMBOLS[s.type]?.prim ? defs.get(s.id).title : s.type}) is not connected`, ref: { kind: 'symbol', id: s.id, pin: p.name }, x: pp.x, y: pp.y });
      }
    }
  }
  for (const p of doc.ports) {
    const net = portNet.get(p.id);
    if (!net || net.endpoints.length <= 1) diags.push({ severity: 'warning', message: `I/O marker '${p.name}' is not connected`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y });
  }
  // duplicate instance / port names
  const seen = new Map();
  for (const s of doc.symbols) { const k = nk(s.name); if (seen.has(k)) diags.push({ severity: 'error', message: `duplicate instance name '${s.name}'`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y }); seen.set(k, s); }
  // an instance named with a reserved word (#679): the label of a module's instance in the HDL (an error when
  // the HDL would not compile), a warning for the others
  for (const s of doc.symbols) if (rsvd(s.name)) diags.push({ severity: s.type === 'module' && !validIdent(s.name, doc.lang) ? 'error' : 'warning', message: `${rsvd(s.name)}: rename it`, ref: { kind: 'symbol', id: s.id }, x: s.x, y: s.y });
  const pseen = new Set();
  for (const p of doc.ports) { const k = nk(p.name); if (pseen.has(k)) diags.push({ severity: 'error', message: `duplicate I/O marker '${p.name}'`, ref: { kind: 'port', id: p.id }, x: p.x, y: p.y }); pseen.add(k); }
  return { nets, pinNet, portNet, wireNet, labelNet, junctions: junctionsOf(doc, pinInfo), diagnostics: diags };
}
function byNameCount(labels, labelOf, nk) { return 0; }
function refOf(e, symById) {
  if (!e) return { kind: 'sheet' };
  return e.kind === 'pin' ? { kind: 'symbol', id: e.sym, pin: e.pin } : { kind: 'port', id: e.port };
}
function epName(e, symById, doc) {
  if (e.kind === 'pin') { const s = symById.get(e.sym); return `${s?.name ?? '?'}.${e.pin}`; }
  return `port ${doc.ports.find(p => p.id === e.port)?.name ?? '?'}`;
}

// Junction dots: points where three or more branches meet (wire ends, a pin or a marker, #678; a wire
// through the point counts two, but connects there only at a vertex shared with ends).
function junctionsOf(doc, pinInfo = new Map()) {
  const arms = new Map();
  const add = (pt, n) => { const k = key(pt.x, pt.y); arms.set(k, (arms.get(k) || 0) + n); };
  for (const w of doc.wires) { const P = w.points; add(P[0], 1); add(P[P.length - 1], 1); }
  for (const pt of pinInfo.values()) if (arms.has(key(pt.x, pt.y))) add(pt, 1);
  const out = [];
  for (const [k, n] of arms) if (n >= 3) { const [x, y] = k.split(',').map(Number); out.push({ x, y }); }
  return out;
}

// Where two wires cross without connecting (#692): a horizontal segment and a vertical one, the point
// inside both (not an end of either: a wire's end, a bend, a T-junction). [{ x, y, wire, seg }]: the
// horizontal segment's wire and index, which hops over the vertical one. A view of the drawing only.
export function wireCrossings(doc) {
  const H = [], Vt = [];
  for (const w of doc.wires) for (let i = 0; i + 1 < w.points.length; i++) {
    const a = w.points[i], b = w.points[i + 1];
    if (a.y === b.y && a.x !== b.x) H.push({ w: w.id, i, y: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    else if (a.x === b.x && a.y !== b.y) Vt.push({ w: w.id, i, x: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
  }
  const out = [];
  for (const h of H) for (const v of Vt) if (v.x > h.lo && v.x < h.hi && h.y > v.lo && h.y < v.hi) out.push({ x: v.x, y: h.y, wire: h.w, seg: h.i });
  return out;
}

// the segment of wire w that point p is inside of (on a segment or a bend, not one of its ends), or -1
function interiorAt(w, p) {
  const P = w.points, n = P.length;
  if ((P[0].x === p.x && P[0].y === p.y) || (P[n - 1].x === p.x && P[n - 1].y === p.y)) return -1;
  for (let i = 0; i + 1 < n; i++) if (onSeg(p, P[i], P[i + 1])) return i;
  return -1;
}

// Splits the wires (of ids, or all of them) at the points inside them, so that each point is an end of
// the wires through it and connects there (#678): a wire ended on another's segment, a symbol or an
// I/O marker dropped onto a wire (#170). Returns the wires added, [{ id, from }] (from: the wire split).
export function splitWiresAt(doc, pts, ids = null) {
  const used = new Set(doc.wires.map(w => w.id));
  const nid = () => { let k = doc.wires.length + 1; while (used.has(`W${k}`)) k++; used.add(`W${k}`); return `W${k}`; };
  const added = [];
  for (const p of pts) {
    for (let j = 0; j < doc.wires.length; j++) {
      const w = doc.wires[j];
      if (ids && !ids.has(w.id) && !added.some(a => a.id === w.id)) continue;
      const i = interiorAt(w, p);
      if (i < 0) continue;
      const P = w.points, same = q => q.x === p.x && q.y === p.y;
      const head = P.slice(0, i + 1), tail = P.slice(i + 1);
      if (!same(head[head.length - 1])) head.push({ x: p.x, y: p.y });
      if (!same(tail[0])) tail.unshift({ x: p.x, y: p.y });
      w.points = head;
      const t = { id: nid(), points: tail };
      if (w.bus) t.bus = true;
      doc.wires.splice(j + 1, 0, t);
      added.push({ id: t.id, from: w.id });
    }
  }
  return added;
}

// The connections made in the middle of wires, as wire ends (#678): the wires split at every pin,
// I/O marker and wire end inside them, and at the bends two wires share. For a document of version 2
// (its nets kept) and the schematics made by the app (from HDL, a truth table, ISE's .sch).
export function joinOnWires(doc, modules = {}) {
  modules = normModules(modules);
  const pts = [];
  for (const s of doc.symbols) for (const p of symbolPins(s, modules)) pts.push(p);
  for (const p of doc.ports) pts.push(p);
  return joinWires(doc, pts);
}
// (of the wires of ids, or all of them: at the points given, their ends and their shared bends; a
// generator's net, its wires joined to its own pins only)
export function joinWires(doc, pts, ids = null) {
  pts = [...pts];
  const bends = new Map();
  for (const w of doc.wires) {
    if (ids && !ids.has(w.id)) continue;
    pts.push(w.points[0], w.points[w.points.length - 1]);
    for (const q of new Set(w.points.slice(1, -1).map(q => key(q.x, q.y)))) bends.set(q, (bends.get(q) || 0) + 1);
  }
  for (const [k, n] of bends) if (n > 1) { const [x, y] = k.split(',').map(Number); pts.push({ x, y }); }
  return splitWiresAt(doc, pts, ids);
}

// ===================================================================== HDL text helpers
// (the shared lists, core/reserved.js, #679: a name the HDL of its language refuses is an error; one that is
// a reserved word in another letter case, of the other language or of SystemVerilog, a warning)
const VHDL_RESERVED = VHDL93_WORDS;
const VLOG_RESERVED = new Set([...VERILOG_WORDS, 'logic']);
// an existing name: a word of VHDL or Verilog (SystemVerilog's own words are refused only for a new name)
export const rsvd = n => reservedError(n, { sv: false });
export function validIdent(name, lang) {
  if (lang === 'vhdl') return /^[A-Za-z](?:_?[A-Za-z0-9])*$/.test(name) && !VHDL_RESERVED.has(name.toLowerCase());
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) && !VLOG_RESERVED.has(name);
}

// value text ("5", "0x1F", "0b01xz", "'1'", "8'hFF", "x\"0F\"") -> bit string of the given width (MSB first)
export function constBits(value, width) {
  let s = String(value ?? '0').trim().replace(/_/g, '');
  let bits = null;
  let m;
  if ((m = /^'([01xzXZuU-])'$/.exec(s))) bits = m[1];
  else if ((m = /^(?:0b|b)"?([01xzXZ]+)"?$/i.exec(s)) || (m = /^"([01xzXZuU-]+)"$/.exec(s))) bits = m[1];
  else if ((m = /^(?:0x|x)"?([0-9a-f]+)"?$/i.exec(s))) bits = BigInt('0x' + m[1]).toString(2);
  else if ((m = /^(\d+)?'([bhdo])([0-9a-fxz]+)$/i.exec(s))) {
    const base = m[2].toLowerCase();
    if (base === 'b') bits = m[3];
    else if (base === 'h' && !/[xz]/i.test(m[3])) bits = BigInt('0x' + m[3]).toString(2);
    else if (base === 'o') bits = BigInt('0o' + m[3]).toString(2);
    else if (base === 'd') bits = BigInt(m[3]).toString(2);
  } else if ((m = /^-?\d+$/.exec(s))) {
    let v = BigInt(s);
    if (v < 0n) v = (1n << BigInt(width)) + v;
    bits = v.toString(2);
  }
  if (bits == null) return null;
  bits = bits.toLowerCase().replace(/[u-]/g, 'x');
  if (bits.length > width) bits = bits.slice(bits.length - width);
  if (bits.length < width) bits = (bits[0] === 'x' || bits[0] === 'z' ? bits[0] : '0').repeat(width - bits.length) + bits;
  return bits;
}
export const vhdlBits = (bits, scalar) => (scalar ? `'${bits.toUpperCase()}'` : `"${bits.toUpperCase()}"`);
export const vlogBits = bits => `${bits.length}'b${bits}`;

// Tokenizer shared by the source span helpers. Tokens: { v (lower-cased for VHDL ids), s, e, k }
export function tokenize(text, lang) {
  const toks = [];
  const n = text.length;
  let i = 0;
  const vh = lang === 'vhdl';
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') { i++; continue; }
    if (vh && c === '-' && text[i + 1] === '-') { while (i < n && text[i] !== '\n') i++; continue; }
    if (!vh && c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (!vh && c === '(' && text[i + 1] === '*' && text[i + 2] !== ')') { const e = text.indexOf('*)', i + 2); i = e < 0 ? n : e + 2; continue; }
    const s = i;
    if (c === '"') {
      i++;
      while (i < n) { if (text[i] === '\\' && !vh) { i += 2; continue; } if (text[i] === '"') { if (vh && text[i + 1] === '"') { i += 2; continue; } i++; break; } if (text[i] === '\n') break; i++; }
      toks.push({ v: text.slice(s, i), s, e: i, k: 'str' }); continue;
    }
    if (vh && c === "'") {
      const prev = toks[toks.length - 1];
      const isTick = prev && (prev.k === 'id' || prev.v === ')') && !(prev.k === 'id' && /^(when|else|then|return|and|or|xor|not|nand|nor|xnor|is|of|in|out|select|report|severity)$/.test(prev.v));
      if (!isTick && text[i + 2] === "'") { toks.push({ v: text.slice(i, i + 3), s, e: i + 3, k: 'chr' }); i += 3; continue; }
      toks.push({ v: "'", s, e: i + 1, k: 'op' }); i++; continue;
    }
    if (/[A-Za-z_]/.test(c) || (!vh && (c === '$' || c === '`'))) {
      i++;
      while (i < n && /[\w$]/.test(text[i])) i++;
      const raw = text.slice(s, i);
      toks.push({ v: vh ? raw.toLowerCase() : raw, raw, s, e: i, k: 'id' }); continue;
    }
    if (!vh && c === '\\') { while (i < n && !/\s/.test(text[i])) i++; toks.push({ v: text.slice(s, i), s, e: i, k: 'id' }); continue; }
    if (/[0-9]/.test(c) || (!vh && c === "'" && /[sSbBhHdDoO]/.test(text[i + 1] || ''))) {
      if (!vh) {
        while (i < n && /[0-9_]/.test(text[i])) i++;
        let j = i; while (text[j] === ' ') j++;
        if (text[j] === "'" && /[sSbBhHdDoO]/.test(text[j + 1] || '')) {
          i = j + 1; if (/[sS]/.test(text[i])) i++; i++;
          while (text[i] === ' ') i++;
          while (i < n && /[0-9a-fA-FxXzZ_?]/.test(text[i])) i++;
        } else if (text[i] === '.') { i++; while (i < n && /[0-9]/.test(text[i])) i++; }
      } else {
        while (i < n && /[0-9_.#a-fA-F]/.test(text[i])) { if (text[i] === '#') { i++; while (i < n && /[0-9a-fA-F_.]/.test(text[i])) i++; if (text[i] === '#') i++; break; } i++; }
      }
      toks.push({ v: text.slice(s, i), s, e: i, k: 'num' }); continue;
    }
    const two = text.slice(i, i + 2), three = text.slice(i, i + 3);
    const ops3 = ['<<<', '>>>', '===', '!=='];
    const ops2 = vh ? ['<=', '=>', ':=', '/=', '>=', '**', '<>'] : ['<=', '>=', '==', '!=', '&&', '||', '<<', '>>', '~&', '~|', '~^', '^~', '+:', '-:', '**', '->'];
    let op = c;
    if (!vh && ops3.includes(three)) op = three; else if (ops2.includes(two)) op = two;
    toks.push({ v: op, s, e: i + op.length, k: 'op' });
    i += op.length;
  }
  return toks;
}

export function lineStarts(text) { const a = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') a.push(i + 1); return a; }
export function offsetOf(ls, loc) { if (!loc) return -1; return (ls[loc.line - 1] ?? 0) + (loc.col || 1) - 1; }
export function tokAt(toks, off) { let lo = 0, hi = toks.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[m].e <= off) lo = m + 1; else hi = m; } return lo; }
export function skipParen(toks, i) {
  // toks[i] should be '(' ; returns index after the matching ')'
  if (toks[i]?.v !== '(') return i;
  let d = 0;
  for (; i < toks.length; i++) { if (toks[i].v === '(') d++; else if (toks[i].v === ')') { d--; if (d === 0) return i + 1; } }
  return i;
}
export function toSemi(toks, i) {
  let d = 0;
  for (; i < toks.length; i++) {
    const v = toks[i].v;
    if (v === '(' || v === '[' || v === '{') d++;
    else if (v === ')' || v === ']' || v === '}') d--;
    else if (v === ';' && d <= 0) return i + 1;
  }
  return i;
}
export function stripComments(s, lang) {
  return lang === 'vhdl' ? s.replace(/--[^\n]*/g, '') : s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
export const squash = s => s.replace(/\s+/g, ' ').trim();

// re-indent a verbatim slice whose first line started at column `col` (1-based)
export function dedent(text, col = 1) {
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines[0];
  let min = Infinity;
  for (const l of lines.slice(1)) if (l.trim()) min = Math.min(min, l.length - l.trimStart().length);
  const firstIndent = col - 1;
  min = Math.min(min, firstIndent);
  if (!Number.isFinite(min)) min = 0;
  const out = [first.trimStart(), ...lines.slice(1).map(l => (l.trim() ? l.slice(Math.min(min, l.length - l.trimStart().length)) : ''))];
  // for the first line, relative indent is firstIndent - min (keep it flush left)
  return out.join('\n').replace(/\s+$/, '');
}
// remove the common indentation of all lines (and surrounding blank lines)
export function dedentBlock(text) {
  const lines = String(text ?? '').replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let min = Infinity;
  for (const l of lines) if (l.trim()) min = Math.min(min, l.length - l.trimStart().length);
  if (!Number.isFinite(min)) min = 0;
  return lines.map(l => l.slice(Math.min(min, l.length - l.trimStart().length)).replace(/\s+$/, '')).join('\n');
}
export const indent = (text, pad) => String(text).split('\n').map(l => (l.trim() ? pad + l : '')).join('\n');

// The text of a statement [s0, e0) with its comments (#225: an HDL block keeps them): the comment
// lines just above it and the comment ending its last line; not the comments the generated HDL
// writes itself (a block's title line, the file's header, a block entity's mark), so that a module
// made again from its generated HDL does not take them. Verilog: also an attribute (* … *) before it.
// Returns [s, e].
export function withComments(text, s0, e0, lang) {
  const c = lang === 'vhdl' ? '--' : '//';
  const own = new RegExp(`^\\s*${c} *(\\S+: HDL block\\b|Generated by Silinx\\b|${BLOCK_MARK}\\b)`);
  const isC = new RegExp(`^\\s*${c}`);
  let s = s0, e = e0;
  if (lang !== 'vhdl') { const m = /\(\*[^\n]*?\*\)\s*$/.exec(text.slice(Math.max(0, s - 200), s)); if (m) s -= m[0].length; }
  let ls = text.lastIndexOf('\n', s - 1) + 1;
  if (!text.slice(ls, s).trim()) {
    while (ls > 0) {
      const p = text.lastIndexOf('\n', ls - 2) + 1;
      const line = text.slice(p, ls - 1);
      if (!isC.test(line) || own.test(line)) break;
      s = p + line.length - line.trimStart().length;
      ls = p;
    }
  }
  const nl = text.indexOf('\n', e);
  const rest = text.slice(e, nl < 0 ? text.length : nl);
  if (isC.test(rest) && !own.test(rest)) e += rest.replace(/\s+$/, '').length;
  return [s, e];
}
// a Verilog text with its compiler directive lines (`ifdef, `else, `endif, `define…) blanked (the
// same offsets): a statement after `endif starts at its own keyword
export function blankDirectives(text) {
  return text.replace(/^[ \t]*`(ifdef|ifndef|elsif|else|endif|define|undef|include|timescale|default_nettype|resetall|celldefine|endcelldefine|line|pragma)\b[^\n]*/gm, m => ' '.repeat(m.length));
}

// Verilog statement extent (token index -> index after the statement)
export function vStmt(toks, i) {
  const t = toks[i];
  if (!t) return i;
  const v = t.v;
  const match = (open, close) => {
    let d = 0;
    for (; i < toks.length; i++) {
      if (open.includes(toks[i].v)) d++;
      else if (close.includes(toks[i].v)) { d--; if (d === 0) { i++; if (toks[i]?.v === ':' && close.includes('end')) i += 2; return i; } }
    }
    return i;
  };
  if (v === 'begin') return match(['begin'], ['end']);
  if (v === 'fork') return match(['fork'], ['join', 'join_any', 'join_none']);
  if (v === 'case' || v === 'casez' || v === 'casex') return match(['case', 'casez', 'casex'], ['endcase']);
  if (v === 'if') { i = vStmt(toks, skipParen(toks, i + 1)); if (toks[i]?.v === 'else') i = vStmt(toks, i + 1); return i; }
  if (v === 'for' || v === 'while' || v === 'repeat' || v === 'foreach') return vStmt(toks, skipParen(toks, i + 1));
  if (v === 'forever') return vStmt(toks, i + 1);
  if (v === 'wait') { i = skipParen(toks, i + 1); return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i); }
  if (v === '@') {
    i++;
    if (toks[i]?.v === '(') i = skipParen(toks, i); else i++;
    return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i);
  }
  if (v === '#') {
    i++;
    if (toks[i]?.v === '(') i = skipParen(toks, i); else i++;
    return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i);
  }
  if (v === ';') return i + 1;
  return toSemi(toks, i);
}
const V_BOUNDARY = new Set([';', 'end', 'endcase', 'endfunction', 'endtask', 'endgenerate', 'generate', 'begin', 'endmodule', 'join']);
export function vStmtStart(toks, i) {
  let j = i;
  while (j > 0 && !V_BOUNDARY.has(toks[j - 1].v)) j--;
  // skip a label after begin / end ( "begin : name" ) - not expected at module level
  return j;
}

// ===================================================================== IR expression printers
const V_OPS = { nand: null, nor: null };
export function prVlog(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar || !e.sized ? (e.scalar ? `1'b${e.bits}` : `'b${e.bits}`) : `${e.bits.length}'b${e.bits}`;
    case 'int': return e.value;
    case 'real': return String(e.value);
    case 'str': return JSON.stringify(e.value);
    case 'ref': return e.name;
    case 'index': return `${prVlog(e.base)}[${prVlog(e.index)}]`;
    case 'slice': return `${prVlog(e.base)}[${prVlog(e.left)}:${prVlog(e.right)}]`;
    case 'pslice': return `${prVlog(e.base)}[${prVlog(e.start)} ${e.dir}: ${prVlog(e.width)}]`;
    case 'apply': case 'call': return `${e.name}(${e.args.map(a => prVlog(a.named !== undefined ? a.value : a)).join(', ')})`;
    case 'concat': return `{${e.parts.map(prVlog).join(', ')}}`;
    case 'repl': return `{${prVlog(e.count)}{${prVlog(e.value)}}}`;
    case 'unary': return `${e.o}(${prVlog(e.a)})`;
    case 'binary': {
      if (e.o === 'nand') return `~(${prVlog(e.a)} & ${prVlog(e.b)})`;
      if (e.o === 'nor') return `~(${prVlog(e.a)} | ${prVlog(e.b)})`;
      const o = { mod: '%', rem: '%' }[e.o] || e.o;
      return `(${prVlog(e.a)} ${o} ${prVlog(e.b)})`;
    }
    case 'cond': return `(${prVlog(e.cond)} ? ${prVlog(e.then)} : ${prVlog(e.else)})`;
  }
  return '0';
}
export function prVhdl(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar ? `'${e.bits.toUpperCase()}'` : `"${e.bits.toUpperCase()}"`;
    case 'int': return e.value;
    case 'real': return String(e.value).includes('.') ? String(e.value) : `${e.value}.0`;
    case 'phys': return `${e.value} ${e.unit}`;
    case 'str': return `"${String(e.value).replace(/"/g, '""')}"`;
    case 'ref': return e.name;
    case 'index': return `${prVhdl(e.base)}(${prVhdl(e.index)})`;
    case 'slice': return `${prVhdl(e.base)}(${prVhdl(e.left)} downto ${prVhdl(e.right)})`;
    case 'apply': return `${e.name}(${e.args.map(a => (a.named !== undefined ? `${a.named} => ${prVhdl(a.value)}` : prVhdl(a))).join(', ')})`;
    case 'call': return `${e.name}(${e.args.map(prVhdl).join(', ')})`;
    case 'concat': return e.parts.map(prVhdl).join(' & ');
    case 'unary': return e.o === '~' ? `not ${prVhdl(e.a)}` : e.o === 'abs' ? `abs ${prVhdl(e.a)}` : `${e.o}${prVhdl(e.a)}`;
    case 'binary': {
      const o = { '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', '==': '=', '!=': '/=', '<<': 'sll', '>>': 'srl', '<<<': 'sla', '>>>': 'sra', '%': 'rem' }[e.o] || e.o;
      return `(${prVhdl(e.a)} ${o} ${prVhdl(e.b)})`;
    }
    case 'attr': return `${prVhdl(e.prefix)}'${e.attr}${e.args?.length ? `(${e.args.map(prVhdl).join(', ')})` : ''}`;
    case 'aggregate': return `(${e.items.map(i => (i.choices ? i.choices.map(c => (c === 'others' ? 'others' : c.range ? `${prVhdl(c.range.left)} ${c.range.dir || 'to'} ${prVhdl(c.range.right)}` : prVhdl(c))).join(' | ') + ' => ' : '') + prVhdl(i.value)).join(', ')})`;
    case 'qualified': return `${e.type}'(${prVhdl(e.expr)})`;
  }
  return '0';
}
export const unparen = s => (/^\(.*\)$/.test(s) && balanced(s.slice(1, -1)) ? s.slice(1, -1) : s);
function balanced(s) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') { d--; if (d < 0) return false; } } return d === 0; }

export function typeTextVhdl(t) {
  if (!t) return 'std_logic';
  if (t.kind === 'logic') {
    if (!t.range) return 'std_logic';
    return `${t.signed ? 'signed' : 'std_logic_vector'}(${unparen(prVhdl(t.range.left))} ${t.range.dir || 'downto'} ${unparen(prVhdl(t.range.right))})`;
  }
  if (t.kind === 'integer') return t.range ? `integer range ${unparen(prVhdl(t.range.left))} ${t.range.dir || 'to'} ${unparen(prVhdl(t.range.right))}` : 'integer';
  if (t.kind === 'boolean') return 'boolean';
  if (t.kind === 'named') return t.name;
  return 'std_logic';
}
export function rangeTextVlog(t) {
  if (!t || !t.range) return '';
  return `[${unparen(prVlog(t.range.left))}:${unparen(prVlog(t.range.right))}]`;
}

