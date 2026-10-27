// Silinx HLS (#1762): IEEE-754 binary32 in the C Silinx HLS synthesizes (integers, constant loops), each operation on the
// values' bits (unsigned int), rounded to nearest, ties to even, subnormals in and out, infinities; a NaN result the
// quiet NaN 0x7fc00000 (the C simulation's: its values JavaScript's numbers). A synthesized function's floating-point
// operations call it (#1761), so the hardware gives the C simulation's bits. Isomorphic ES module.
//
//   SOFTFLOAT32: the C source; its functions, a and b a float's bits:
//     ap_f32_add(a, b)  ap_f32_sub(a, b)  ap_f32_mul(a, b)          the result's bits
//     ap_f32_eq(a, b)  ap_f32_lt(a, b)  ap_f32_le(a, b)  ap_f32_unord(a, b)   0 or 1 (a NaN: unordered, not equal)
//     ap_f32_from_i32(int x)  ap_f32_from_u32(unsigned x)           the nearest float's bits
//     ap_f32_to_i32(a)  ap_f32_to_u32(a)                            truncated toward zero, its bits modulo 2^32
//                                                                     (out of range: the C simulation's; a NaN or
//                                                                     an infinity 0)
//   F32_NAN: the quiet NaN's bits

export const F32_NAN = 0x7fc00000;

export const SOFTFLOAT32 = `
/* (in the synthesized code a call is a statement of its own or a whole value, not after && || ?:) */
static int ap_f32_unord(unsigned a, unsigned b) { return ((a & 0x7fffffffu) > 0x7f800000u) | ((b & 0x7fffffffu) > 0x7f800000u); }
/* the result: its sign, its exponent e (biased; under 1, subnormal), its significand m with 3 more bits (its leading
   one at bit 26, or under it when e is 1), rounded to nearest even */
static unsigned ap_f32_pack(unsigned s, int e, unsigned m) {
  if (e < 1) {
    int sh = 1 - e;
    if (sh > 26) m = m != 0u;
    else m = (m >> sh) | ((m & ((1u << sh) - 1u)) != 0u);
    e = 1;
  }
  unsigned low = m & 7u;
  m = m >> 3;
  if (low > 4u || (low == 4u && (m & 1u))) {
    m = m + 1u;
    if (m == 0x1000000u) { m = m >> 1; e = e + 1; }
  }
  if (e >= 255) return (s << 31) | 0x7f800000u;
  return (s << 31) | ((m & 0x800000u) ? ((unsigned)e << 23) : 0u) | (m & 0x7fffffu);
}
/* (a function with a loop: one return, at its end; its special cases a flag, its loop always run) */
static unsigned ap_f32_add(unsigned a, unsigned b) {
  unsigned sa = a >> 31, sb = b >> 31;
  int ea = (int)((a >> 23) & 255u), eb = (int)((b >> 23) & 255u);
  unsigned ma = a & 0x7fffffu, mb = b & 0x7fffffu;
  int za = (a & 0x7fffffffu) == 0u, zb = (b & 0x7fffffffu) == 0u;
  int special = 1;
  unsigned res = 0u;
  int nan = ap_f32_unord(a, b);
  if (nan) res = 0x7fc00000u;
  else if (ea == 255) res = eb == 255 && sa != sb ? 0x7fc00000u : a;
  else if (eb == 255) res = b;
  else if (za) res = zb ? (sa & sb) << 31 : b;
  else if (zb) res = a;
  else special = 0;
  if (ea) ma = ma | 0x800000u; else ea = 1;
  if (eb) mb = mb | 0x800000u; else eb = 1;
  /* |a| >= |b| */
  if (ea < eb || (ea == eb && ma < mb)) {
    unsigned ts = sa; sa = sb; sb = ts;
    int te = ea; ea = eb; eb = te;
    unsigned tm = ma; ma = mb; mb = tm;
  }
  ma = ma << 3;
  mb = mb << 3;
  int d = ea - eb;
  if (d > 26) mb = 1u;
  else if (d > 0) mb = (mb >> d) | ((mb & ((1u << d) - 1u)) != 0u);
  unsigned m = sa == sb ? ma + mb : ma - mb;
  if (m & 0x8000000u) { m = (m >> 1) | (m & 1u); ea = ea + 1; }
  for (int i = 0; i < 26; i++) {
    if (!(m & 0x4000000u) && ea > 1) { m = m << 1; ea = ea - 1; }
  }
  unsigned r = ap_f32_pack(sa, ea, m);
  if (!special && m == 0u) r = 0u;
  return special ? res : r;
}
static unsigned ap_f32_sub(unsigned a, unsigned b) { return ap_f32_add(a, b ^ 0x80000000u); }
static unsigned ap_f32_mul(unsigned a, unsigned b) {
  unsigned s = (a ^ b) >> 31;
  int ea = (int)((a >> 23) & 255u), eb = (int)((b >> 23) & 255u);
  unsigned ma = a & 0x7fffffu, mb = b & 0x7fffffu;
  int za = (a & 0x7fffffffu) == 0u, zb = (b & 0x7fffffffu) == 0u;
  int special = 1;
  unsigned res = 0u;
  int nan = ap_f32_unord(a, b);
  if (nan) res = 0x7fc00000u;
  else if (ea == 255 || eb == 255) res = za || zb ? 0x7fc00000u : (s << 31) | 0x7f800000u;
  else if (za || zb) res = s << 31;
  else special = 0;
  if (ea) ma = ma | 0x800000u; else ea = 1;
  if (eb) mb = mb | 0x800000u; else eb = 1;
  for (int i = 0; i < 23; i++) {
    if (!(ma & 0x800000u)) { ma = ma << 1; ea = ea - 1; }
    if (!(mb & 0x800000u)) { mb = mb << 1; eb = eb - 1; }
  }
  unsigned long long p = (unsigned long long)ma * (unsigned long long)mb;
  int e = ea + eb - 127;
  if (p & 0x800000000000ull) e = e + 1; else p = p << 1;
  unsigned m = (unsigned)(p >> 21) | ((p & 0x1fffffull) != 0ull);
  unsigned r = ap_f32_pack(s, e, m);
  return special ? res : r;
}
static int ap_f32_eq(unsigned a, unsigned b) {
  if (ap_f32_unord(a, b)) return 0;
  if (((a | b) & 0x7fffffffu) == 0u) return 1;
  return a == b;
}
static int ap_f32_lt(unsigned a, unsigned b) {
  if (ap_f32_unord(a, b)) return 0;
  if (((a | b) & 0x7fffffffu) == 0u) return 0;
  unsigned sa = a >> 31, sb = b >> 31;
  if (sa != sb) return (int)sa;
  return sa ? a > b : a < b;
}
static int ap_f32_le(unsigned a, unsigned b) {
  int l = ap_f32_lt(a, b);
  int e = ap_f32_eq(a, b);
  return l | e;
}
static unsigned ap_f32_from_mag(unsigned s, unsigned u) {
  int zero = u == 0u;
  int e = 158;
  for (int i = 0; i < 31; i++) {
    if (!(u & 0x80000000u)) { u = u << 1; e = e - 1; }
  }
  unsigned r = ap_f32_pack(s, e, (u >> 5) | ((u & 31u) != 0u));
  return zero ? 0u : r;
}
static unsigned ap_f32_from_i32(int x) {
  unsigned s = x < 0 ? 1u : 0u;
  unsigned u = x < 0 ? 0u - (unsigned)x : (unsigned)x;
  return ap_f32_from_mag(s, u);
}
static unsigned ap_f32_from_u32(unsigned x) { return ap_f32_from_mag(0u, x); }
static unsigned ap_f32_to_u32(unsigned a) {
  int e = (int)((a >> 23) & 255u) - 127;
  if (e < 0 || e == 128) return 0u;
  unsigned long long m = (unsigned long long)((a & 0x7fffffu) | 0x800000u);
  unsigned v;
  if (e >= 23) v = e - 23 > 40 ? 0u : (unsigned)(m << (e - 23));
  else v = (unsigned)(m >> (23 - e));
  return (a >> 31) ? 0u - v : v;
}
static int ap_f32_to_i32(unsigned a) { return (int)ap_f32_to_u32(a); }
`;
