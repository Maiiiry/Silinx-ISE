// Silinx HLS (#1768): float in synthesis (core/c-dataflow.js's methods, mixed into its Flow). A float value is its IEEE-754
// bits (a node of 32 bits, its type t.fl 32); each operation calls the soft-float library (core/c-softfloat.js, its
// function inlined where the operation is, its loops unrolled), so the hardware gives the C simulation's bits: + - *,
// the comparisons, the conversions to and from the integers, -x, !x. A double constant is a float's value when it is
// converted to one (float s = 0.0;, a float's argument or result); in an operation with a float, a constant written as
// a float (0.5f), or one a float holds exactly in a comparison: double arithmetic is not made yet (#1761).
// Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT, typeOf } from './c-types.js';
import { F32 } from './c-float.js';
import { parse } from './c-parse.js';
import { SOFTFLOAT32 } from './c-softfloat.js';

const U32 = { w: 32, s: false, ap: false };
let LIB = null;
/** The library's functions (parsed once, their loops unrolled). */
function lib() {
  if (LIB) return LIB;
  const ast = parse(SOFTFLOAT32, 'silinx-softfloat.c');
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.kind === 'for' || n.kind === 'while' || n.kind === 'do') n.unroll = true;
    for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') walk(v);
  };
  walk(ast.items);
  LIB = new Map(ast.items.filter((it) => it.kind === 'func' && it.body).map((f) => [f.name, f]));
  return LIB;
}
/** A function of the library (its names ap_f32_…), else null. */
export const softfloatFn = (name) => (/^ap_f32_/.test(name) ? lib().get(name) ?? null : null);
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
/** A number's binary32 bits (a NaN the quiet NaN). */
export function f32Bits(x) { if (Number.isNaN(x)) return 0x7fc00000n; f32[0] = x; return BigInt(u32[0]); }

export const floatMethods = {
  /** The library's function `name` called on the values args, where the operation is (under g): its result of type rt. */
  softfloat(name, args, rt, g, loc) {
    const fn = lib().get(name);
    const scope = new Map();
    fn.params.forEach((pa, k) => { const t = typeOf(pa.type); scope.set(pa.name, { kind: 'var', t, val: this.v(this.g.add('ext', [args[k].id], t), t).id, name: pa.name }); });
    const saved = this.scopes;
    let r;
    // (a function of its arguments only: no guard)
    try { r = this.inline(fn, scope, this.T); } finally { this.scopes = saved; }
    if (!r) this.error(loc, `internal: ${name} gave no value`);
    return this.v(this.g.add('ext', [r.id], rt), rt);
  },
  /** A double constant as a float (its value rounded once, as the C simulation's). */
  fconstBits(x) { return this.v(this.g.const(f32Bits(Math.fround(x.fconst)), F32), F32); },
  /** x as a value of the type t, one of them a float. */
  flConv(x, t, g) {
    if (x.fconst !== undefined) {
      if (t.fl === 32) return this.fconstBits(x);
      return this.conv(this.flConv(x, F32, g), t, g);
    }
    if (x.t.fl && t.fl) { if (x.t.fl !== t.fl || t.fl !== 32) this.error(x.loc, 'double is not made in hardware yet: use float (#1761)'); return x; }
    if (t.fl) {
      if (t.fl !== 32) this.error(x.loc, 'double is not made in hardware yet: use float (#1761)');
      if (x.t.fx) this.error(x.loc, 'an ap_fixed converted to a float: not made yet');
      if (x.t.w > 32) this.error(x.loc, `a ${x.t.w}-bit integer converted to a float: not made yet (32 bits at most)`);
      return x.t.s || x.t.w < 32 ? this.softfloat('ap_f32_from_i32', [this.v(this.g.add('ext', [x.id], { w: 32, s: x.t.s }), INT)], F32, g, x.loc)
        : this.softfloat('ap_f32_from_u32', [x], F32, g, x.loc);
    }
    // (to an integer: truncated, its bits as the C simulation's)
    if (t.bool) return this.v(this.flBool(x), t);
    if (t.fx) this.error(x.loc, 'a float converted to an ap_fixed: not made yet');
    const u = this.softfloat(t.s ? 'ap_f32_to_i32' : 'ap_f32_to_u32', [x], t.s ? INT : U32, g, x.loc);
    return this.v(this.g.add('ext', [u.id], t), t);
  },
  /** Whether a float is not 0 (+0, -0: false; a NaN: true). */
  flBool(x) { return this.g.add('ne', [this.g.add('and', [x.id, this.g.const(0x7fffffffn, F32)], F32), this.g.const(0, F32)], BOOL); },
  /** A float operand: a float, an integer converted, a constant written as a float (or, in a comparison, held exactly). */
  flOperand(x, cmp, g) {
    if (x.fconst !== undefined) {
      if (!x.single && !(cmp && Math.fround(x.fconst) === x.fconst)) this.error(x.loc, `the double constant ${x.text}: double arithmetic is not made in hardware yet: write ${x.text}f (a float) (#1761)`);
      return this.fconstBits(x);
    }
    if (x.t.fl && x.t.fl !== 32) this.error(x.loc, 'double is not made in hardware yet: use float (#1761)');
    return x.t.fl ? x : this.flConv(x, F32, g);
  },
  flArith(op, l, r, e, g) {
    const a = this.flOperand(l, false, g), b = this.flOperand(r, false, g);
    const fn = { '+': 'ap_f32_add', '-': 'ap_f32_sub', '*': 'ap_f32_mul' }[op];
    if (!fn) this.error(e.loc, op === '/' ? 'a float division is not made in hardware yet (#1761)' : `'${op}' of a float is not C`);
    return this.softfloat(fn, [a, b], F32, g, e.loc);
  },
  flCompare(op, l, r, g, loc) {
    const a = this.flOperand(l, true, g), b = this.flOperand(r, true, g);
    const call = (name, x, y) => this.softfloat(name, [x, y], BOOL, g, loc);
    switch (op) {
      case '==': return call('ap_f32_eq', a, b);
      case '!=': return this.v(this.not(call('ap_f32_eq', a, b).id), BOOL);
      case '<': return call('ap_f32_lt', a, b);
      case '<=': return call('ap_f32_le', a, b);
      case '>': return call('ap_f32_lt', b, a);
      default: return call('ap_f32_le', b, a);
    }
  },
  /** -x of a float: its sign flipped. */
  flNeg(x) { return this.v(this.g.add('xor', [x.id, this.g.const(0x80000000n, F32)], F32), F32); },
};
