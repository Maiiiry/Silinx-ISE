// Silinx HLS: ap_fixed<W, I, Q, O, N> / ap_ufixed, as AMD's ap_fixed.h computes them (the C simulation). A value is
// its W bits (a BigInt, read signed or not), its weight 2^-F (F = W - I fractional bits). The types of the results
// (RType: + - * / and the bitwise operators, full precision), the quantization (AP_TRN … AP_RND_CONV) and overflow
// (AP_WRAP, AP_SAT, AP_SAT_ZERO, AP_SAT_SYM) of a conversion to a type, the conversions from and to integers and
// doubles, the decimal text C++'s cout prints (to_string(10) reduced to the stream's precision). Isomorphic ES module.
//
//   fixedType(w, i, s, q, o, n)        { w, s, ap: true, fx: true, f: w - i, q, o, n }
//   asFixed(t)                         an integer type (C or ap_int) as the ap_fixed AMD converts it to
//   fixedResult(op, a, b)              the type of a op b (op: + - * / & | ^)
//   toFixed(x, t)                      a value { v, t } (an integer, a fixed, a double: v a number) as a value of t
//   fixedOp(op, a, b)                  a op b, each { v, t }: { v, t }
//   fixedCompare(op, a, b)             a op b (a comparison), as AMD's
//   fixedToInt(x)                      toward zero (to_int, C's conversion), a BigInt
//   fixedToDouble(x)                   a number
//   fixedText(x, precision)            C++'s cout of it

export const Q_MODES = ['AP_RND', 'AP_RND_ZERO', 'AP_RND_MIN_INF', 'AP_RND_INF', 'AP_RND_CONV', 'AP_TRN', 'AP_TRN_ZERO'];
export const O_MODES = ['AP_SAT', 'AP_SAT_ZERO', 'AP_SAT_SYM', 'AP_WRAP', 'AP_WRAP_SM'];

export const fixedType = (w, i, s, q = 'AP_TRN', o = 'AP_WRAP', n = 0) => ({ w, s, ap: true, fx: true, f: w - i, q, o, n });
/** A C integer is ap_fixed<w, w>; an ap_int<W> ap_fixed<W, W> (AMD's conversions). */
export const asFixed = (t) => (t.fx ? t : fixedType(t.bool ? 1 : t.w, t.bool ? 1 : t.w, t.bool ? false : t.s));

const I = (t) => t.w - t.f;
export function fixedResult(op, a, b) {
  a = asFixed(a); b = asFixed(b);
  const F = Math.max(a.f, b.f);
  const ii = Math.max(I(a) + (b.s && !a.s ? 1 : 0), I(b) + (a.s && !b.s ? 1 : 0));
  switch (op) {
    case '*': return fixedType(a.w + b.w, I(a) + I(b), a.s || b.s);
    case '+': return fixedType(ii + 1 + F, ii + 1, a.s || b.s);
    case '-': return fixedType(ii + 1 + F, ii + 1, true);
    case '/': return fixedType((b.s ? 1 : 0) + a.w + Math.max(b.f, 0), (b.s ? 1 : 0) + I(a) + b.f, a.s || b.s);
    default: return fixedType(ii + F, ii, a.s || b.s);   // & | ^
  }
}

/** v's low w bits, read signed or not. */
const bits = (v, w, s) => {
  const m = (1n << BigInt(w)) - 1n;
  let x = v & m;
  if (s && (x >> BigInt(w - 1)) & 1n) x -= 1n << BigInt(w);
  return x;
};
/** raw (weight 2^-from) at weight 2^-to, rounded by the quantization mode q (to < from: bits dropped). */
function quantize(raw, from, to, q) {
  if (to >= from) return raw << BigInt(to - from);
  const d = BigInt(from - to);
  const base = raw >> d, rem = raw - (base << d), half = 1n << (d - 1n);
  const up = (() => {
    switch (q) {
      case 'AP_TRN': return false;
      case 'AP_TRN_ZERO': return raw < 0n && rem !== 0n;
      case 'AP_RND': return rem >= half;
      case 'AP_RND_ZERO': return rem > half || (rem === half && raw < 0n);
      case 'AP_RND_MIN_INF': return rem > half;
      case 'AP_RND_INF': return rem > half || (rem === half && raw >= 0n);
      case 'AP_RND_CONV': return rem > half || (rem === half && (base & 1n) === 1n);
      default: return false;
    }
  })();
  return up ? base + 1n : base;
}
/** raw (at the type's weight, any size) in the type's W bits by its overflow mode. */
function overflow(raw, t) {
  const max = t.s ? (1n << BigInt(t.w - 1)) - 1n : (1n << BigInt(t.w)) - 1n;
  const min = t.s ? -(1n << BigInt(t.w - 1)) : 0n;
  if (raw >= min && raw <= max && !(t.o === 'AP_SAT_SYM' && t.s && raw === min)) return raw;
  switch (t.o) {
    case 'AP_SAT': return raw > max ? max : min;
    case 'AP_SAT_ZERO': return 0n;
    case 'AP_SAT_SYM': return raw > max ? max : t.s ? -max : 0n;
    default: return bits(raw, t.w, t.s);
  }
}
/** A double's exact value as raw at weight 2^-f, quantized by q. */
function fromDouble(x, f, q) {
  if (!Number.isFinite(x) || x === 0) return 0n;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (exp) m |= 1n << 52n;
  if (x < 0) m = -m;
  // (x = m * 2^e: m at weight 2^-(-e))
  return quantize(m, 1075 - (exp || 1), f, q);
}
export function toFixed(x, t) {
  let raw;
  if (typeof x.v === 'number') raw = fromDouble(x.v, t.f, t.q);
  else { const xt = asFixed(x.t); raw = quantize(x.t.bool ? (x.v ? 1n : 0n) : x.v, xt.f, t.f, t.q); }
  return { v: overflow(raw, t), t };
}
/** a op b, each converted to the result's type exactly (aligned), the result in its type's bits. */
export function fixedOp(op, a, b) {
  const t = fixedResult(op, a.t, b.t);
  const at = asFixed(a.t), bt = asFixed(b.t);
  if (op === '/') {
    if (b.v === 0n) return null;
    const v = (a.v << BigInt(Math.max(bt.f, 0))) / b.v;   // (toward zero, as sdiv / udiv)
    return { v: bits(v, t.w, t.s), t };
  }
  if (op === '*') return { v: bits(a.v * b.v, t.w, t.s), t };   // (F = F1 + F2: the raw product)
  const A = a.v << BigInt(t.f - at.f), B = b.v << BigInt(t.f - bt.f);
  const v = op === '+' ? A + B : op === '-' ? A - B : op === '&' ? A & B : op === '|' ? A | B : A ^ B;
  return { v: bits(v, t.w, t.s), t };
}
/** a op b (< > <= >= == !=), as AMD compares them: the one with fewer fractional bits widened to the other's weight,
 *  then their bits compared as ap_private does (mixed signs: as signed or unsigned by their widths, as gcc). */
export function fixedCompare(op, a, b) {
  const at = asFixed(a.t), bt = asFixed(b.t);
  let A = a.v, B = b.v, wa = at.w, wb = bt.w;
  if (at.f > bt.f) { B <<= BigInt(at.f - bt.f); wb = Math.max(bt.w + at.f - bt.f, 1); }
  else if (at.f < bt.f) { A <<= BigInt(bt.f - at.f); wa = Math.max(at.w + bt.f - at.f + 1, 1); }
  return apCompare(op, A, wa, at.s, B, wb, bt.s);
}
/** ap_private<wa, sa>'s comparison with ap_private<wb, sb> (AMD's etc/ap_private.h): A and B their values. */
export function apCompare(op, A, wa, sa, B, wb, sb) {
  if (op === '>=') return !apCompare('<', A, wa, sa, B, wb, sb);
  if (op === '<=') return !apCompare('>', A, wa, sa, B, wb, sb);
  if (op === '==' || op === '!=') {
    // (both extended to the wider by their own sign, their bits compared)
    const m = Math.max(wa, wb), mask = (1n << BigInt(m)) - 1n;
    const eq = (A & mask) === (B & mask);
    return op === '==' ? eq : !eq;
  }
  const m = Math.max(wa, wb) + (sa || sb ? 1 : 0);
  let signed;
  if (sa === sb) signed = sa;
  else if (wa <= 64 && wa < 32 && wb < 32) signed = true;
  else if (sa) signed = !(wb >= wa);
  else signed = !(wa >= wb);
  const mask = (1n << BigInt(m)) - 1n;
  const x = signed ? A : A & mask, y = signed ? B : B & mask;
  return op === '<' ? x < y : x > y;
}
export const fixedToInt = (x) => (x.t.f > 0 ? x.v / (1n << BigInt(x.t.f)) : x.v << BigInt(-x.t.f));
export function fixedToDouble(x) {
  // (exact when it fits a double: its integer, then its power of 2)
  return x.t.f >= 0 ? Number(x.v) / 2 ** x.t.f : Number(x.v) * 2 ** -x.t.f;
}

/** to_string(10): its exact decimal value (no trailing zeros). */
export function fixedDecimal(x) {
  const neg = x.v < 0n;
  const a = neg ? -x.v : x.v;
  const f = x.t.f;
  if (f <= 0) return `${neg ? '-' : ''}${(a << BigInt(-f)).toString()}`;
  const ip = a >> BigInt(f), fp = a - (ip << BigInt(f));
  let s = `${neg ? '-' : ''}${ip}`;
  if (fp) {
    // (fp / 2^f: f decimals, the trailing zeros dropped)
    const d = (fp * 10n ** BigInt(f)) >> BigInt(f);
    s += `.${d.toString().padStart(f, '0').replace(/0+$/, '')}`;
  }
  return s;
}
/** AMD's scientificFormat. */
function scientific(input) {
  if (!input.length) return input;
  let dec = input.indexOf('.');
  if (dec < 0) dec = input.length;
  let first = 0;
  while (input[first] > '9' || input[first] < '1') first++;
  const exp = first > dec ? dec - first : dec - first - 1;
  let es = '';
  if (exp < 0) es = `e-${String(-exp).padStart(2, '0')}`;
  else if (exp > 0) es = `e+${String(exp).padStart(2, '0')}`;
  let last = input.length - 1;
  for (; last >= 0; --last) if (input[last] <= '9' && input[last] > '0') break;
  let ans = input[first];
  if (first !== last) { ans += '.'; for (let i = first + 1; i <= last; i++) if (input[i] !== '.') ans += input[i]; }
  return ans + es;
}
/** AMD's reduceToPrecision: the decimal text to `precision` significant digits (rounded half up on the digits),
 *  in scientific notation when it starts with 4 zeros or more after the point, or has more integer digits. */
function reduce(input, precision) {
  const len = input.length;
  if (![...input].some((c) => c !== '.' && c !== '0' && c !== '-')) return '0';
  let first = 0, last = len - 1, trunc = 0;
  let dec = input.indexOf('.');
  while (input[first] < '1' || input[first] > '9') first++;
  while (input[last] < '1' || input[last] > '9') last--;
  if (dec < 0) dec = len;
  if (dec > last) {
    if (last - first + 1 <= precision) return input;
    trunc = first + precision;
  } else if (dec < first) {
    if (last - first + 1 <= precision) {
      if (first - dec - 1 < 4) return input;
      return input[0] === '-' ? `-${scientific(input.slice(1))}` : scientific(input);
    }
    trunc = first + precision;
  } else {
    if (last - first <= precision) return input;
    trunc = first + precision + 1;
  }
  let ans = '';
  let dup;
  if (input[0] === '-') { ans += '-'; dup = `0${input.slice(1)}`; }
  else { dup = `0${input}`; ++trunc; }
  const d = [...dup];
  let carry = d[trunc] > '4';
  for (let i = trunc - 1; i >= 0 && carry; i--) {
    if (d[i] === '.') continue;
    if (d[i] === '9') d[i] = '0';
    else { d[i] = String.fromCharCode(d[i].charCodeAt(0) + 1); carry = false; }
  }
  first = 0;
  if (d[0] !== '1') while (d[first] < '1' || d[first] > '9') ++first;
  let n = 0;
  for (let it = first; it < d.length; it++) {
    if (d[it] === '.') continue;
    if (++n > precision) d[it] = '0';
  }
  let s = d.join('');
  dec = s.indexOf('.');
  if (dec < 0) trunc = s.length;
  else {
    for (trunc = s.length - 1; trunc >= 0; --trunc) {
      if (s[trunc] === '.') break;
      if (s[trunc] !== '0') { trunc++; break; }
    }
  }
  s = s[0] === '1' ? s.slice(0, trunc) : s.slice(1, trunc);
  dec = s.indexOf('.');
  if (dec >= 0) {
    let it = dec + 1;
    while (s[it] === '0') it++;
    if (it - dec - 1 < 4) return ans + s;
    return ans + scientific(s);
  }
  if (s.length <= precision) return ans + s;
  return ans + scientific(s);
}
export const fixedText = (x, precision = 6) => reduce(fixedDecimal(x), precision);
