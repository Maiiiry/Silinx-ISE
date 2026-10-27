// Silinx HLS (#1643): ap_fixed / ap_ufixed in synthesis (core/c-dataflow.js's methods, mixed into its Flow). A fixed
// value is its raw bits (a node of its width and sign, its type t.fx with its fractional bits t.f): an operation aligns
// its operands' points with shifts and works on the raw bits in the type AMD's ap_fixed.h gives the result
// (core/c-fixed.js); a conversion to a type drops bits with its quantization's rounding (an adder, the bits it looks
// at) and handles its overflow (a wrap is a truncation; a saturation compares with the type's bounds). A double
// constant is only an ap_fixed's value (a = 0.5;, a table of coefficients): the C simulation's rules give its bits.
// Comparisons as AMD's (its ap_private's rules for mixed signs). Isomorphic ES module.
import { BOOL } from './c-types.js';
import { fixedType, asFixed, fixedResult, toFixed } from './c-fixed.js';
import { constValue } from './c-check.js';

const OPS = { '+': 'add', '-': 'sub', '&': 'and', '|': 'or', '^': 'xor' };

export const fixedMethods = {
  /** A double constant (a literal, -literal): its number, to be an ap_fixed's value. */
  floatConst(e, neg = false) { const x = Number(e.text.replace(/[fFlL]$/, '')); return { fconst: neg ? -x : x, t: { w: 64, s: true, fl: 64 }, id: null, loc: e.loc }; },
  /** The bits of a constant initial value e of the type t (an ap_fixed's: a double or an integer, quantized as the C
   *  simulation does), or null. */
  constOf(e, t) {
    if (!t?.fx) return constValue(e, this.consts());
    const neg = e.kind === 'unary' && e.op === '-' && e.e.kind === 'float';
    if (e.kind === 'float' || neg) return toFixed({ v: this.floatConst(neg ? e.e : e, neg).fconst }, t).v;
    const c = constValue(e, this.consts());
    return c === null ? null : toFixed({ v: c, t: { w: 64, s: true } }, t).v;
  },
  /** x as a value of the type t, one of them an ap_fixed (or x a double constant). */
  fxConv(x, t) {
    if (x.fconst !== undefined) {
      if (!t.fx) this.error(x.loc, 'floating point is not supported in Silinx HLS yet: a double constant only as an ap_fixed\'s value');
      return this.v(this.g.const(toFixed({ v: x.fconst }, t).v, t), t);
    }
    if (!t.fx) return this.fxToInt(x, t);
    const st = asFixed(x.t);
    // its raw bits as a fixed value (a C integer's, an ap_int's: their bits, F = 0)
    let v = this.v(this.g.add('ext', [x.id], { w: st.w, s: st.s }), { w: st.w, s: st.s });
    let f = st.f;
    if (t.f > f) {
      // (more fractional bits: shifted left, wide enough)
      const w = v.t.w + (t.f - f);
      v = this.v(this.g.add('shl', [this.g.add('ext', [v.id], { w, s: v.t.s }), this.g.const(t.f - f, { w: 32, s: false })], { w, s: v.t.s }), { w, s: v.t.s });
      f = t.f;
    } else if (t.f < f) v = this.quantize(v, f - t.f, t.q);
    return this.overflow(v, t);
  },
  /** v's d lowest bits dropped, rounded by the mode q (core/c-fixed.js's quantize). */
  quantize(v, d, q) {
    const w = v.t.w, s = v.t.s;
    const bit = (k) => (k < w ? this.g.add('slice', [v.id], BOOL, { hi: k, lo: k }) : s ? this.g.add('slice', [v.id], BOOL, { hi: w - 1, lo: w - 1 }) : this.g.const(0, BOOL));
    const bt = { w: Math.max(w - d, 1) + 1, s };
    // (floor: an arithmetic shift; one more bit for the rounding's carry)
    const base = this.g.add('shr', [this.g.add('ext', [v.id], { w: w + 1, s }), this.g.const(d, { w: 32, s: false })], { w: w + 1, s });
    const b = this.g.add('ext', [base], bt);
    const neg = s ? bit(w - 1) : this.g.const(0, BOOL);
    const half = bit(d - 1);
    const rest = d > 1 ? this.g.add('ne', [this.g.add('slice', [v.id], { w: Math.min(d - 1, w), s: false }, { hi: Math.min(d - 2, w - 1), lo: 0 }), this.g.const(0, { w: Math.min(d - 1, w), s: false })], BOOL) : this.g.const(0, BOOL);
    const any = this.or(half, rest);
    const lsb = this.g.add('slice', [b], BOOL, { hi: 0, lo: 0 });
    const up = {
      AP_TRN: () => this.g.const(0, BOOL),
      AP_TRN_ZERO: () => this.and(neg, any),
      AP_RND: () => half,
      AP_RND_ZERO: () => this.and(half, this.or(rest, neg)),
      AP_RND_MIN_INF: () => this.and(half, rest),
      AP_RND_INF: () => this.and(half, this.or(rest, this.not(neg))),
      AP_RND_CONV: () => this.and(half, this.or(rest, lsb)),
    }[q]();
    return this.v(this.g.add('add', [b, this.g.add('ext', [up], bt)], bt), bt);
  },
  /** v (raw bits at t's point) in t's width by its overflow mode. */
  overflow(v, t) {
    const tt = { w: t.w, s: t.s };
    if (t.o === 'AP_WRAP') return this.v(this.g.add('ext', [v.id], t), t);
    // (saturations: v compared with t's bounds in a type holding both)
    const ct = { w: Math.max(v.t.w, t.w) + 2, s: true };
    const x = this.g.add('ext', [v.id], ct);
    const max = t.s ? (1n << BigInt(t.w - 1)) - 1n : (1n << BigInt(t.w)) - 1n;
    const min = t.s ? -(1n << BigInt(t.w - 1)) : 0n;
    const hi = this.g.add('gt', [x, this.g.const(max, ct)], BOOL);
    const lo = this.g.add(t.o === 'AP_SAT_SYM' && t.s ? 'le' : 'lt', [x, this.g.const(min, ct)], BOOL);
    const inT = this.g.add('ext', [v.id], tt);
    const low = t.o === 'AP_SAT_ZERO' ? 0n : t.o === 'AP_SAT_SYM' && t.s ? -max : min;
    const high = t.o === 'AP_SAT_ZERO' ? 0n : max;
    const r = this.mux(hi, this.g.const(high, tt), this.mux(lo, this.g.const(low, tt), inT, tt), tt);
    return this.v(r, t);
  },
  /** A fixed value as an integer type t: toward zero (C++'s conversion, to_int). */
  fxToInt(x, t) {
    const st = x.t;
    if (t.bool) return this.v(this.bool(x), t);
    if (st.f <= 0) return this.v(this.g.add('ext', [this.g.add('shl', [this.g.add('ext', [x.id], { w: st.w - st.f, s: st.s }), this.g.const(-st.f, { w: 32, s: false })], { w: st.w - st.f, s: st.s })], t), t);
    // ((raw + (negative ? 2^F - 1 : 0)) >> F)
    const wt = { w: st.w + 1, s: st.s };
    const neg = st.s ? this.g.add('slice', [x.id], BOOL, { hi: st.w - 1, lo: st.w - 1 }) : this.g.const(0, BOOL);
    const bias = this.mux(neg, this.g.const((1n << BigInt(st.f)) - 1n, wt), this.g.const(0, wt), wt);
    const sum = this.g.add('add', [this.g.add('ext', [x.id], wt), bias], wt);
    return this.v(this.g.add('ext', [this.g.add('shr', [sum, this.g.const(st.f, { w: 32, s: false })], wt)], t), t);
  },
  /** l op r, one of them an ap_fixed: + - * / & | ^ in AMD's result types; << >> its raw bits. */
  fxArith(op, l, r, e) {
    if (l.fconst !== undefined || r.fconst !== undefined) this.error(e.loc, 'floating point is not supported in Silinx HLS yet: a double constant only as an ap_fixed\'s value');
    if (op === '<<' || op === '>>') {
      if (!l.t.fx) this.error(e.loc, 'a shift by an ap_fixed');
      return this.v(this.g.add(op === '<<' ? 'shl' : 'shr', [l.id, r.id], l.t), l.t);
    }
    if (op === '%') this.error(e.loc, "'%' of an ap_fixed");
    const t = fixedResult(op, l.t, r.t);
    const raw = { w: t.w, s: t.s };
    const lt = asFixed(l.t), rt = asFixed(r.t);
    if (op === '*') {
      const p = this.g.add('mul', [this.g.add('ext', [l.id], raw), this.g.add('ext', [r.id], raw)], raw);
      return this.v(p, t);
    }
    if (op === '/') {
      // ((l << max(F2, 0)) / r, toward zero): by a constant power of 2, as the integers' division
      const sh = Math.max(rt.f, 0), w = Math.max(lt.w + sh + 1, rt.w + 1);
      const a = this.v(this.g.add('shl', [this.g.add('ext', [l.id], { w, s: true }), this.g.const(sh, { w: 32, s: false })], { w, s: true }), { w, s: true });
      const b = this.v(this.g.add('ext', [r.id], { w, s: true }), { w, s: true });
      const q = this.divide('/', a, b, { w, s: true }, e);
      return this.v(this.g.add('ext', [q.id], raw), t);
    }
    const al = (x, xt) => this.g.add('shl', [this.g.add('ext', [x.id], raw), this.g.const(t.f - xt.f, { w: 32, s: false })], raw);
    return this.v(this.g.add(OPS[op], [al(l, lt), al(r, rt)], raw), t);
  },
  /** l op r (a comparison), one of them an ap_fixed: as AMD's (core/c-fixed.js's fixedCompare, apCompare). */
  fxCompare(op, l, r) {
    if (l.fconst !== undefined || r.fconst !== undefined) return this.fxCompareDouble(op, l, r);
    const at = asFixed(l.t), bt = asFixed(r.t);
    let A = l.id, B = r.id, wa = at.w, wb = bt.w;
    const shl = (id, n, w, s) => this.g.add('shl', [this.g.add('ext', [id], { w, s }), this.g.const(n, { w: 32, s: false })], { w, s });
    if (at.f > bt.f) { wb = Math.max(bt.w + at.f - bt.f, 1); B = shl(B, at.f - bt.f, wb, bt.s); }
    else if (at.f < bt.f) { wa = Math.max(at.w + bt.f - at.f + 1, 1); A = shl(A, bt.f - at.f, wa, at.s); }
    const sa = at.s, sb = bt.s;
    let ct, cop = op;
    if (op === '==' || op === '!=') ct = { w: Math.max(wa, wb), s: false };
    else {
      let signed;
      if (sa === sb) signed = sa;
      else if (wa <= 64 && wa < 32 && wb < 32) signed = true;
      else if (sa) signed = !(wb >= wa);
      else signed = !(wa >= wb);
      ct = { w: Math.max(wa, wb) + (sa || sb ? 1 : 0), s: signed };
    }
    const x = this.g.add('ext', [this.g.add('ext', [A], { w: wa, s: sa })], ct), y = this.g.add('ext', [this.g.add('ext', [B], { w: wb, s: sb })], ct);
    return this.v(this.g.add({ '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }[cop], [x, y], BOOL), BOOL);
  },
  /** x op d, d a double constant: as AMD's (x.to_double() op d), the two exact values compared. */
  fxCompareDouble(op, l, r) {
    const flip = l.fconst !== undefined;
    const x = flip ? r : l, d = flip ? l.fconst : r.fconst;
    if (x.fconst !== undefined || !Number.isFinite(d)) this.error(x.loc, 'floating point is not supported in Silinx HLS yet: a double constant only as an ap_fixed\'s value');
    // (d = k / 2^f exactly)
    let f = 0;
    while (!Number.isInteger(d * 2 ** f) && f < 1100) f++;
    const k = BigInt(d * 2 ** f);
    const xt = asFixed(x.t), F = Math.max(xt.f, f);
    const w = Math.max(xt.w + F - xt.f, k.toString(2).length + F - f) + 2;
    const ct = { w, s: true };
    const a = this.g.add('shl', [this.g.add('ext', [x.id], ct), this.g.const(F - xt.f, { w: 32, s: false })], ct);
    const b = this.g.const(k << BigInt(F - f), ct);
    const ops = { '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };
    const sw = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '==', '!=': '!=' };
    return this.v(this.g.add(ops[flip ? sw[op] : op], [a, b], BOOL), BOOL);
  },
  /** -x (one bit wider) and ~x of an ap_fixed. */
  fxUnary(op, x) {
    if (op === '+') return x;
    if (op === '~') return this.v(this.g.add('not', [x.id], x.t), x.t);
    const t = fixedType(x.t.w + 1, x.t.w - x.t.f + 1, true);
    return this.v(this.g.add('neg', [this.g.add('ext', [x.id], { w: t.w, s: true })], t), t);
  },
};
