// Silinx - the compiled simulator's expressions (#405: out of compileNetlist in core/compiled-sim.js): a list of
// bits as a value of a kind, the combinational cells in topological order (a loop: a CompileError), each cell's
// value as code.
import { CompileError, CMP, SHIFTS, UNARY, bigOf, extB, extN, fix32, int, lit, mB, mN, pbits, sB, sN } from './compiled-helpers.js';

/** { cellExpr, combOf, inBits, order, rdExpr, sig, warnings } of compileNetlist. */
export function mountExpressions(ctx) {
  const {
    top, wide, cellName, comb, elems, mod, src, vars
  } = ctx;

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

  return { cellExpr, combOf, inBits, order, rdExpr, sig, warnings };
}
