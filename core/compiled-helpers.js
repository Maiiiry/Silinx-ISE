// Silinx - the compiled simulator's parameters and constants (#405: out of core/compiled-sim.js): a netlist's
// parameters read, the code of a value in a kind, the helpers the generated code calls, the cells' kinds, the
// activity's and the code's sizes, statements in chunks.

/** What the compiled simulator cannot compile, with the reason (the emulator then keeps the event-driven one). */
export class CompileError extends Error {}

// ------------------------------------------------------------------ parameters, constants
export const int = s => (typeof s === 'number' ? s : parseInt(String(s).replace(/[xz]/gi, '0'), 2));
// a parameter's bits, least significant first (x / z as 0)
export const pbits = s => (typeof s === 'number' ? s.toString(2) : String(s)).split('').reverse().map(c => (c === '1' ? 1 : 0));
export const bigOf = bits => { let v = 0n; for (let i = bits.length - 1; i >= 0; i--) v = (v << 1n) | BigInt(bits[i]); return v; };

// code of a value in a kind: 'n' (a number, unsigned, up to 32 bits) or 'b' (a BigInt)
export const lit = (v, kind) => (kind === 'b' ? `${BigInt(v)}n` : String(Number(v)));
export const mN = (e, w) => (w >= 32 ? `((${e}) >>> 0)` : `((${e}) & ${2 ** w - 1})`);
export const sN = (e, w) => (w >= 32 ? `((${e}) | 0)` : `(((${e}) << ${32 - w}) >> ${32 - w})`);   // the signed value
export const fix32 = (e, w) => (w >= 32 ? `((${e}) >>> 0)` : e);
export const extN = (e, fw, tw, signed) => (tw === fw ? e : tw < fw ? mN(e, tw) : signed ? mN(sN(e, fw), tw) : e);
export const mB = (e, w) => `BigInt.asUintN(${w}, ${e})`;
export const sB = (e, w) => `BigInt.asIntN(${w}, ${e})`;
export const extB = (e, fw, tw, signed) => (tw === fw ? e : tw < fw ? mB(e, tw) : signed ? mB(sB(e, fw), tw) : e);
export const conv = (e, from, to) => (from === to ? e : to === 'b' ? `BigInt(${e})` : `Number(${e})`);

// the helpers the generated code calls (H)
export const HELPERS = {
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
export const lcm = (a, b) => a / gcd(a, b) * b;
export const IGNORED = new Set(['$scopeinfo', '$print', '$check', '$assert', '$assume', '$cover', '$live', '$fair', '$specify2', '$specify3', '$specrule']);
export const FF = new Set(['$dff', '$dffe', '$adff', '$adffe', '$sdff', '$sdffe', '$sdffce', '$aldff', '$aldffe', '$dffsr', '$dffsre', '$dlatch', '$adlatch']);
export const COMB = new Set(['$not', '$pos', '$neg', '$and', '$or', '$xor', '$xnor', '$reduce_and', '$reduce_or', '$reduce_xor', '$reduce_xnor', '$reduce_bool',
  '$logic_not', '$logic_and', '$logic_or', '$eq', '$ne', '$eqx', '$nex', '$lt', '$le', '$gt', '$ge', '$add', '$sub', '$mul', '$div', '$mod', '$divfloor', '$modfloor',
  '$shl', '$sshl', '$shr', '$sshr', '$shift', '$shiftx', '$mux', '$pmux', '$bmux', '$demux', '$bwmux', '$lut']);
export const UNARY = new Set(['$not', '$pos', '$neg', '$reduce_and', '$reduce_or', '$reduce_xor', '$reduce_xnor', '$reduce_bool', '$logic_not']);
export const SHIFTS = new Set(['$shl', '$sshl', '$shr', '$sshr', '$shift', '$shiftx']);
export const CMP = { $eq: '===', $ne: '!==', $eqx: '===', $nex: '!==', $lt: '<', $le: '<=', $gt: '>', $ge: '>=' };
export const SETTLE_LIMIT = 10000;
export const PROFILE = 20000;   // the cycles of the activity's profile (compileNetlist)
export const GUARD = 2;         // a segment's guard, as cells
export const PMAX = 0.3;        // a segment more often evaluated: unguarded
export const WORTH = 0.5;       // the guards, when they leave at most this part of the cells evaluated per step
export const OPS = 4;           // (#670) a cell's operations, as cells (compileNetlist's weightOf)
export const CUT_GAIN = 0.25;   // (#670) a cut changing more often than this part of what it reads: no cut
export const DETECT = 1.5;      // (#670) a cut's test of its changes, as cells
export const SPLIT = 80000;     // the characters of code above which run() is split (#629: compileNetlist)
export const CHUNK = 40000;     // the characters of a function of its combinational code, at most
export const PIECE = 10000;     // the cycles of a call of run() at most (#650: CompiledSim.cycle)

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
