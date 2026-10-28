// Silinx HLS (#1762, #1773): IEEE-754 binary32 and binary64 in the C Silinx HLS synthesizes (integers, constant loops),
// each operation on the values' bits (unsigned int, unsigned long long), rounded to nearest, ties to even, subnormals in
// and out, infinities; a NaN result the quiet NaN (the C simulation's: its values JavaScript's numbers). Both made from
// one source, their widths its parameters. A synthesized function's floating-point operations call it (#1761), so the
// hardware gives the C simulation's bits. Isomorphic ES module.
//
//   SOFTFLOAT32, SOFTFLOAT64: the C sources; their functions (p f32 or f64), a and b the values' bits:
//     ap_p_add(a, b)  ap_p_sub(a, b)  ap_p_mul(a, b)          the result's bits
//     ap_p_eq(a, b)  ap_p_lt(a, b)  ap_p_le(a, b)  ap_p_unord(a, b)   0 or 1 (a NaN: unordered, not equal)
//     ap_p_from_i32(int x)  ap_p_from_u32(unsigned x)         the nearest value's bits
//     ap_p_to_i32(a)  ap_p_to_u32(a)                          truncated toward zero, its bits modulo 2^32 (out of
//                                                               range: the C simulation's; a NaN or an infinity 0)
//     ap_f64_from_f32(a)  ap_f32_from_f64(a)                  a float as a double (exact), a double rounded to a float
//   F32_NAN, F64_NAN: the quiet NaNs' bits

export const F32_NAN = 0x7fc00000;
export const F64_NAN = 0x7ff8000000000000n;

const FMT = {
  f32: { T: 'unsigned', u: 'u', W: 32, M: 23, bias: 127, emax: 255 },
  f64: { T: 'unsigned long long', u: 'ull', W: 64, M: 52, bias: 1023, emax: 2047 },
};

/** The source of one format's functions. */
function source(p) {
  const { T, u, W, M, bias, emax } = FMT[p];
  const h = (n) => `0x${BigInt(n).toString(16)}${u}`;
  const SIGN = h(1n << BigInt(W - 1)), ABS = h((1n << BigInt(W - 1)) - 1n), INF = h(BigInt(emax) << BigInt(M));
  const QNAN = h((BigInt(emax) << BigInt(M)) | (1n << BigInt(M - 1))), IMPL = h(1n << BigInt(M)), MMASK = h((1n << BigInt(M)) - 1n);
  const G = M + 3;   // (the significand with 3 more bits: its leading one at bit G)
  const ONE = `1${u}`, ZERO = `0${u}`;
  const mul = p === 'f32' ? `
  unsigned long long pr = (unsigned long long)ma * (unsigned long long)mb;
  int e = ea + eb - ${bias};
  if (pr & 0x800000000000ull) e = e + 1; else pr = pr << 1;
  unsigned m = (unsigned)(pr >> 21) | ((pr & 0x1fffffull) != 0ull);` : `
  /* (the 106-bit product of two 53-bit significands, from 32-bit halves) */
  unsigned long long ah = ma >> 32, al = ma & 0xffffffffull, bh = mb >> 32, bl = mb & 0xffffffffull;
  unsigned long long ll = al * bl, lh = al * bh, hl = ah * bl, hh = ah * bh;
  unsigned long long mid = (ll >> 32) + (lh & 0xffffffffull) + (hl & 0xffffffffull);
  unsigned long long lo = (mid << 32) | (ll & 0xffffffffull);
  unsigned long long hi = hh + (lh >> 32) + (hl >> 32) + (mid >> 32);
  int e = ea + eb - ${bias};
  unsigned long long m;
  if (hi & 0x20000000000ull) { e = e + 1; m = (hi << 14) | (lo >> 50) | ((lo & 0x3ffffffffffffull) != 0ull); }
  else m = (hi << 15) | (lo >> 49) | ((lo & 0x1ffffffffffffull) != 0ull);`;
  return `
/* (in the synthesized code a call is a statement of its own or a whole value, not after && || ?:) */
static int ap_${p}_unord(${T} a, ${T} b) { return ((a & ${ABS}) > ${INF}) | ((b & ${ABS}) > ${INF}); }
/* the result: its sign, its exponent e (biased; under 1, subnormal), its significand m with 3 more bits (its leading
   one at bit ${G}, or under it when e is 1), rounded to nearest even */
static ${T} ap_${p}_pack(${T} s, int e, ${T} m) {
  if (e < 1) {
    int sh = 1 - e;
    if (sh > ${G}) m = m != ${ZERO};
    else m = (m >> sh) | ((m & ((${ONE} << sh) - ${ONE})) != ${ZERO});
    e = 1;
  }
  ${T} low = m & 7${u};
  m = m >> 3;
  if (low > 4${u} || (low == 4${u} && (m & ${ONE}))) {
    m = m + ${ONE};
    if (m == ${h(1n << BigInt(M + 1))}) { m = m >> 1; e = e + 1; }
  }
  if (e >= ${emax}) return (s << ${W - 1}) | ${INF};
  return (s << ${W - 1}) | ((m & ${IMPL}) ? ((${T})e << ${M}) : ${ZERO}) | (m & ${MMASK});
}
/* (a function with a loop: one return, at its end; its special cases a flag, its loop always run) */
static ${T} ap_${p}_add(${T} a, ${T} b) {
  ${T} sa = a >> ${W - 1}, sb = b >> ${W - 1};
  int ea = (int)((a >> ${M}) & ${emax}${u}), eb = (int)((b >> ${M}) & ${emax}${u});
  ${T} ma = a & ${MMASK}, mb = b & ${MMASK};
  int za = (a & ${ABS}) == ${ZERO}, zb = (b & ${ABS}) == ${ZERO};
  int special = 1;
  ${T} res = ${ZERO};
  int nan = ap_${p}_unord(a, b);
  if (nan) res = ${QNAN};
  else if (ea == ${emax}) res = eb == ${emax} && sa != sb ? ${QNAN} : a;
  else if (eb == ${emax}) res = b;
  else if (za) res = zb ? (sa & sb) << ${W - 1} : b;
  else if (zb) res = a;
  else special = 0;
  if (ea) ma = ma | ${IMPL}; else ea = 1;
  if (eb) mb = mb | ${IMPL}; else eb = 1;
  /* |a| >= |b| */
  if (ea < eb || (ea == eb && ma < mb)) {
    ${T} ts = sa; sa = sb; sb = ts;
    int te = ea; ea = eb; eb = te;
    ${T} tm = ma; ma = mb; mb = tm;
  }
  ma = ma << 3;
  mb = mb << 3;
  int d = ea - eb;
  if (d > ${G}) mb = ${ONE};
  else if (d > 0) mb = (mb >> d) | ((mb & ((${ONE} << d) - ${ONE})) != ${ZERO});
  ${T} m = sa == sb ? ma + mb : ma - mb;
  if (m & ${h(1n << BigInt(G + 1))}) { m = (m >> 1) | (m & ${ONE}); ea = ea + 1; }
  for (int i = 0; i < ${G}; i++) {
    if (!(m & ${h(1n << BigInt(G))}) && ea > 1) { m = m << 1; ea = ea - 1; }
  }
  ${T} r = ap_${p}_pack(sa, ea, m);
  if (!special && m == ${ZERO}) r = ${ZERO};
  return special ? res : r;
}
static ${T} ap_${p}_sub(${T} a, ${T} b) { return ap_${p}_add(a, b ^ ${SIGN}); }
static ${T} ap_${p}_mul(${T} a, ${T} b) {
  ${T} s = (a ^ b) >> ${W - 1};
  int ea = (int)((a >> ${M}) & ${emax}${u}), eb = (int)((b >> ${M}) & ${emax}${u});
  ${T} ma = a & ${MMASK}, mb = b & ${MMASK};
  int za = (a & ${ABS}) == ${ZERO}, zb = (b & ${ABS}) == ${ZERO};
  int special = 1;
  ${T} res = ${ZERO};
  int nan = ap_${p}_unord(a, b);
  if (nan) res = ${QNAN};
  else if (ea == ${emax} || eb == ${emax}) res = za || zb ? ${QNAN} : (s << ${W - 1}) | ${INF};
  else if (za || zb) res = s << ${W - 1};
  else special = 0;
  if (ea) ma = ma | ${IMPL}; else ea = 1;
  if (eb) mb = mb | ${IMPL}; else eb = 1;
  for (int i = 0; i < ${M}; i++) {
    if (!(ma & ${IMPL})) { ma = ma << 1; ea = ea - 1; }
    if (!(mb & ${IMPL})) { mb = mb << 1; eb = eb - 1; }
  }${mul}
  ${T} r = ap_${p}_pack(s, e, m);
  return special ? res : r;
}
static int ap_${p}_eq(${T} a, ${T} b) {
  if (ap_${p}_unord(a, b)) return 0;
  if (((a | b) & ${ABS}) == ${ZERO}) return 1;
  return a == b;
}
static int ap_${p}_lt(${T} a, ${T} b) {
  if (ap_${p}_unord(a, b)) return 0;
  if (((a | b) & ${ABS}) == ${ZERO}) return 0;
  ${T} sa = a >> ${W - 1}, sb = b >> ${W - 1};
  if (sa != sb) return (int)sa;
  return sa ? a > b : a < b;
}
static int ap_${p}_le(${T} a, ${T} b) {
  int l = ap_${p}_lt(a, b);
  int e = ap_${p}_eq(a, b);
  return l | e;
}
/* a 32-bit magnitude u with its sign s: its leading one to bit ${G}, rounded */
static ${T} ap_${p}_from_mag(${T} s, unsigned u) {
  int zero = u == 0u;
  int e = ${bias + 31};
  for (int i = 0; i < 31; i++) {
    if (!(u & 0x80000000u)) { u = u << 1; e = e - 1; }
  }
  ${T} r = ap_${p}_pack(s, e, ${G >= 31 ? `(${T})u << ${G - 31}` : `(u >> ${31 - G}) | ((u & ${(1 << (31 - G)) - 1}u) != 0u)`});
  return zero ? ${ZERO} : r;
}
static ${T} ap_${p}_from_i32(int x) {
  ${T} s = x < 0 ? ${ONE} : ${ZERO};
  unsigned v = x < 0 ? 0u - (unsigned)x : (unsigned)x;
  return ap_${p}_from_mag(s, v);
}
static ${T} ap_${p}_from_u32(unsigned x) { return ap_${p}_from_mag(${ZERO}, x); }
static unsigned ap_${p}_to_u32(${T} a) {
  int e = (int)((a >> ${M}) & ${emax}${u}) - ${bias};
  if (e < 0 || e == ${emax - bias}) return 0u;
  unsigned long long m = (unsigned long long)((a & ${MMASK}) | ${IMPL});
  unsigned v;
  if (e >= ${M}) v = e - ${M} >= 32 ? 0u : (unsigned)(m << (e - ${M}));
  else v = (unsigned)(m >> (${M} - e));
  return (a >> ${W - 1}) ? 0u - v : v;
}
static int ap_${p}_to_i32(${T} a) { return (int)ap_${p}_to_u32(a); }
`;
}

export const SOFTFLOAT32 = source('f32');
export const SOFTFLOAT64 = `${source('f64')}
/* a float as a double: exact (a subnormal float normalized) */
static unsigned long long ap_f64_from_f32(unsigned a) {
  unsigned long long s = (unsigned long long)(a >> 31);
  int e = (int)((a >> 23) & 255u);
  unsigned m = a & 0x7fffffu;
  int zero = (a & 0x7fffffffu) == 0u;
  int nan = (a & 0x7fffffffu) > 0x7f800000u;
  int inf = (a & 0x7fffffffu) == 0x7f800000u;
  /* (a subnormal: normalized; the loop always run, outside a condition) */
  int sub = e == 0;
  if (sub) e = 1;
  for (int i = 0; i < 23; i++) {
    if (sub && !(m & 0x800000u)) { m = m << 1; e = e - 1; }
  }
  unsigned long long r = (s << 63) | ((unsigned long long)(e - 127 + 1023) << 52) | ((unsigned long long)(m & 0x7fffffu) << 29);
  if (zero) r = s << 63;
  if (inf) r = (s << 63) | 0x7ff0000000000000ull;
  if (nan) r = 0x7ff8000000000000ull;
  return r;
}
/* a double rounded to a float (to nearest even, a subnormal float or 0 when too small) */
static unsigned ap_f32_from_f64(unsigned long long a) {
  unsigned s = (unsigned)(a >> 63);
  int e = (int)((a >> 52) & 2047ull);
  unsigned long long m = a & 0xfffffffffffffull;
  int zero = (a & 0x7fffffffffffffffull) == 0ull;
  int nan = (a & 0x7fffffffffffffffull) > 0x7ff0000000000000ull;
  int inf = e == 2047 && !nan;
  if (e) m = m | 0x10000000000000ull; else e = 1;
  unsigned r = ap_f32_pack(s, e - 1023 + 127, (unsigned)(m >> 26) | ((m & 0x3ffffffull) != 0ull));
  if (zero) r = s << 31;
  if (inf) r = (s << 31) | 0x7f800000u;
  if (nan) r = 0x7fc00000u;
  return r;
}
`;
