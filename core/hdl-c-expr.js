// Silinx (#1530): HDL to C, the expressions (out of hdlToC in core/hdl-c.js): the C text of an elaborated design's
// value (core/elaborate.js's nodes), with its width and the sign it carries, at the widths and with the extensions
// Silinx's simulator evaluates it with (core/interp.js: evalE, evalBin, evalUn). Isomorphic ES module.
import { bitpos } from './interp.js';

export const CMP = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=']);
export const REDUCE = new Set(['&', '~&', '|', '~|', '^', '~^', '^~', 'nand', 'nor', 'xnor']);

/** { E, W, SG, ext, dynSlice, psLo, psLoRun } of hdlToC (G: its fields by signal, clock(), isArr, fail, hex, fnOf). */
export function mountExprs(G) {
  const { field, isArr, fail, hex } = G;
  const fnOf = (...a) => G.fnOf(...a);

  // ---------------- expressions: C text of a node, with its width (w) and the sign its value carries (s)
  const W = (n) => {
    switch (n.k) {
      case 'c': return n.val.w;
      case 'sig': return n.sig.t.w;
      case 'bin': return CMP.has(n.o) || n.o === '&&' || n.o === '||' ? 1 : (n.ew || n.t.w);
      case 'un': return n.o === '!' || REDUCE.has(n.o) ? 1 : (n.ew || n.t.w);
      case 'bit': case 'edge': case 'event': return 1;
      case 'cat': return n.parts.reduce((a, p) => a + p.t.w, 0);
      default: return n.ew || n.t.w;
    }
  };
  const SG = (n) => {
    switch (n.k) {
      case 'c': return !!n.val.s;
      case 'sig': return !!n.sig.t.s;
      case 'bin': return CMP.has(n.o) || n.o === '&&' || n.o === '||' ? false : !!(n.es ?? n.t.s);
      case 'un': return n.o === '!' || REDUCE.has(n.o) ? false : !!(n.es ?? n.t.s);
      case 'cond': return n.vh ? !!n.t.s : !!(n.es ?? n.t.s);
      case 'bit': case 'cat': case 'repl': case 'edge': case 'event': return false;
      default: return !!n.t?.s;
    }
  };
  // (an index, a bound: its value with its own sign, as the simulator reads it: a 3-bit k[2:0] of 7 is 7, #1530)
  const idx = (n, ctx) => (SG(n) ? `ap_s(${E(n, ctx)}, ${W(n)})` : `(int64_t)${E(n, ctx)}`);
  // (the values are kept at their width: to the same width, as they are)
  const ext = (n, ctx, to, s) => { const w = W(n); const x = E(n, ctx); return w === to ? x : `ap_x(${x}, ${w}, ${to}, ${s ? 1 : 0})`; };
  const sv = (n, ctx) => (n.sig === G.clock() && ctx.clockedPhase ? '1' : `s->${field.get(n.sig)}`);
  function E(n, ctx) {
    switch (n.k) {
      case 'c': {
        if (Array.isArray(n.val) || n.val.v === undefined) fail('a constant that is not a number (an array, a string, a real)', n);
        return hex(n.val.v, n.val.w);
      }
      case 'sig':
        if (isArr(n.sig)) fail(`the whole array '${n.sig.name}' read: only its elements can be modelled`, n);
        return sv(n, ctx);
      case 'loc': return ctx.local(n);
      case 'edge': case 'event': return ctx.clockedPhase && n.sig === G.clock() ? '1' : '0';
      case 'bit': {
        const b = E(n.base, ctx);
        if (n.index.k === 'c') return `((${b} >> ${bitpos(n.base.t, Number(n.index.val.v))}) & 1)`;
        const i = idx(n.index, ctx);
        const p = n.base.t.desc ? `(${i} - (${n.base.t.right}))` : `((${n.base.t.right}) - ${i})`;
        return `((uint64_t)${p} < ${W(n.base)} ? (${b} >> ${p}) & 1 : 0)`;
      }
      case 'slice': return `ap_m(${E(n.base, ctx)} >> ${n.lo}, ${n.t.w})`;
      case 'dslice': {
        if (n.left.k === 'c' && n.right.k === 'c') {
          const p1 = bitpos(n.base.t, Number(n.left.val.v)), p2 = bitpos(n.base.t, Number(n.right.val.v));
          return `ap_m(${E(n.base, ctx)} >> ${Math.min(p1, p2)}, ${n.t.w})`;
        }
        // (bounds known at run time: its bits from the lower position, as many as the bounds say, at its type's width)
        const d = dynSlice(n.base.t, n.left, n.right, ctx);
        return `ap_dsl(${E(n.base, ctx)}, ${d.p1}, ${d.p2}, ${n.t.w})`;
      }
      case 'pslice': {
        if (n.start.k === 'c') return `ap_m(${E(n.base, ctx)} >> ${psLo(n.base.t, Number(n.start.val.v), n.t.w, n.dir)}, ${n.t.w})`;
        const lo = psLoRun(n.base.t, n.start, n.t.w, n.dir, ctx);
        return `((uint64_t)${lo} < 64 ? ap_m(${E(n.base, ctx)} >> ${lo}, ${n.t.w}) : 0)`;
      }
      case 'elem': {
        const a = n.base;
        if (a.k !== 'sig' || !isArr(a.sig)) fail('an element of an array that is not a signal', n);
        const i = `(${idx(n.index, ctx)} - (${a.sig.t.lo ?? 0}))`;
        return `((uint64_t)${i} < ${a.sig.t.len} ? s->${field.get(a.sig)}[${i}] : 0)`;
      }
      case 'cat': {
        let off = 0;
        const parts = [];
        for (const p of [...n.parts].reverse()) { parts.push(`(${ext(p, ctx, p.t.w, SG(p))} << ${off})`); off += p.t.w; }
        return `ap_m(${parts.join(' | ')}, ${off})`;
      }
      case 'repl': {
        if (n.count.k !== 'c') fail('a replication of a count that is not a constant', n);
        const k = Number(n.count.val.v), w = n.a.t.w, x = ext(n.a, ctx, w, SG(n.a));
        return `ap_m(${Array.from({ length: k }, (_, j) => `(${x} << ${j * w})`).join(' | ') || '0'}, ${k * w})`;
      }
      case 'conv': {
        if (n.t.kind === 'real') fail('a real value', n);
        if (n.sres && n.t.w < W(n.a)) return `ap_m((${E(n.a, ctx)} >> ${W(n.a) - 1} << ${n.t.w - 1}) | ap_m(${E(n.a, ctx)}, ${n.t.w - 1}), ${n.t.w})`;
        return ext(n.a, ctx, n.t.w, !!n.ext);
      }
      case 'cond': {
        const w = W(n), s = SG(n);
        const c = `(${E(n.c, ctx)}) != 0`;
        if (n.vh) return `(${c} ? ${ext(n.a, ctx, w, SG(n.a))} : ${ext(n.b, ctx, w, SG(n.b))})`;
        return `(${c} ? ${ext(n.a, ctx, w, s)} : ${ext(n.b, ctx, w, s)})`;
      }
      case 'un': {
        const w = W(n), s = SG(n);
        switch (n.o) {
          case '~': return `ap_m(~${ext(n.a, ctx, w, s)}, ${w})`;
          case '-': return `ap_m(-${ext(n.a, ctx, w, s)}, ${w})`;
          case '!': return `(uint64_t)(${E(n.a, ctx)} == 0)`;
          case 'abs': return `ap_m((uint64_t)(ap_s(${ext(n.a, ctx, w, s)}, ${w}) < 0 ? -ap_s(${ext(n.a, ctx, w, s)}, ${w}) : ap_s(${ext(n.a, ctx, w, s)}, ${w})), ${w})`;
        }
        const a = E(n.a, ctx), aw = W(n.a), all = `ap_m(~0ULL, ${aw})`;
        switch (n.o) {
          case '&': return `(uint64_t)(${a} == ${all})`;
          case '~&': case 'nand': return `(uint64_t)(${a} != ${all})`;
          case '|': return `(uint64_t)(${a} != 0)`;
          case '~|': case 'nor': return `(uint64_t)(${a} == 0)`;
          case '^': return `ap_par(${a})`;
          case '~^': case '^~': case 'xnor': return `(ap_par(${a}) ^ 1)`;
          default: fail(`the operator '${n.o}' cannot be modelled yet`, n);
        }
        return null;
      }
      case 'bin': return B(n, ctx);
      case 'call': {
        const f = n.fn;
        if (!f?.body || n.outTargets) fail(`a call of ${f?.name ? `'${f.name}'` : 'a subprogram'} with output arguments cannot be modelled yet`, n);
        if (f.retT?.kind === 'real' || f.retT?.kind === 'str' || f.retT?.kind === 'array') fail(`'${f.name}' returns a value that is not a number`, n);
        const args = f.params.map((p, k) => (n.args[k] ? ext(n.args[k], ctx, p.t.w, SG(n.args[k])) : '0'));
        return `${fnOf(f)}(s${args.map((a) => `, ${a}`).join('')})`;
      }
      default: fail(`'${n.k}' cannot be modelled in C`, n);
    }
    return null;
  }
  function B(n, ctx) {
    const o = n.o;
    if (n.fp) fail('a real value', n);
    if (o === '&&' || o === '||') return `(uint64_t)((${E(n.a, ctx)}) != 0 ${o} (${E(n.b, ctx)}) != 0)`;
    if (CMP.has(o)) {
      const os = !!(n.a.t.s && n.b.t.s), cw = Math.max(n.cw || 0, W(n.a), W(n.b));
      const A = ext(n.a, ctx, cw, os), Bx = ext(n.b, ctx, cw, os);
      const op = { '==': '==', '!=': '!=', '===': '==', '!==': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' }[o];
      return os && !['==', '!='].includes(op) ? `(uint64_t)(ap_s(${A}, ${cw}) ${op} ap_s(${Bx}, ${cw}))` : `(uint64_t)(${A} ${op} ${Bx})`;
    }
    const w = n.ew || n.t.w, s = !!(n.es ?? n.t.s);
    const A = ext(n.a, ctx, w, s);
    if (['<<', '<<<', '>>', '>>>', 'rol', 'ror'].includes(o)) {
      if (n.vs && n.fill) fail('a VHDL shift with a fill value', n);
      const k = `ap_m(${E(n.b, ctx)}, ${W(n.b)})`;
      // (VHDL: an amount below 0 shifts the other way, rotations by the amount modulo the width)
      if (n.vs) return `ap_vsh(${['<<', '>>', '<<<', '>>>', 'rol', 'ror'].indexOf(o)}, ${A}, ${n.b.t.s ? `ap_s(${E(n.b, ctx)}, ${W(n.b)})` : `(int64_t)${k}`}, ${w})`;
      if (o === '<<' || o === '<<<') return `ap_shl(${A}, ${k}, ${w})`;
      if (o === '>>' || o === '>>>') return `ap_shr(${A}, ${k}, ${w}, ${o === '>>>' && s ? 1 : 0})`;
      return o === 'rol' ? `ap_m((${A} << (${k} % ${w})) | (${A} >> ((${w} - ${k} % ${w}) % ${w})), ${w})` : `ap_m((${A} >> (${k} % ${w})) | (${A} << ((${w} - ${k} % ${w}) % ${w})), ${w})`;
    }
    const Bx = ext(n.b, ctx, w, s);
    switch (o) {
      case '+': case '-': case '*': return `ap_m(${A} ${o} ${Bx}, ${w})`;
      case '&': case '|': case '^': return `(${A} ${o} ${Bx})`;
      case '~^': case 'xnor': return `ap_m(~(${A} ^ ${Bx}), ${w})`;
      case 'nand': return `ap_m(~(${A} & ${Bx}), ${w})`;
      case 'nor': return `ap_m(~(${A} | ${Bx}), ${w})`;
      case '/': return s ? `(${Bx} ? ap_m((uint64_t)(ap_s(${A}, ${w}) / ap_s(${Bx}, ${w})), ${w}) : 0)` : `(${Bx} ? ${A} / ${Bx} : 0)`;
      case '%': case 'rem': return s ? `(${Bx} ? ap_m((uint64_t)(ap_s(${A}, ${w}) % ap_s(${Bx}, ${w})), ${w}) : 0)` : `(${Bx} ? ${A} % ${Bx} : 0)`;
      case 'mod': return s ? `(${Bx} ? ap_m((uint64_t)((ap_s(${A}, ${w}) % ap_s(${Bx}, ${w}) + ap_s(${Bx}, ${w})) % ap_s(${Bx}, ${w})), ${w}) : 0)` : `(${Bx} ? ${A} % ${Bx} : 0)`;
      default: fail(`the operator '${o}' cannot be modelled yet`, n);
    }
    return null;
  }

  // (a part-select's lowest bit: Verilog's [start +: w] / [start -: w], at run time a C expression)
  function psLo(t, st, w, dir) { const b = dir === '+' ? st + w - 1 : st - w + 1; return Math.min(bitpos(t, st), bitpos(t, b)); }
  function psLoRun(t, start, w, dir, ctx) {
    const i = idx(start, ctx);
    const b = dir === '+' ? `(${i} + ${w - 1})` : `(${i} - ${w - 1})`;
    const pos = (x) => (t.desc ? `(${x} - (${t.right}))` : `((${t.right}) - ${x})`);
    return `(${pos(i)} < ${pos(b)} ? ${pos(i)} : ${pos(b)})`;
  }
  function dynSlice(t, l, r, ctx) {
    const pos = (x) => { const i = idx(x, ctx); return t.desc ? `(${i} - (${t.right}))` : `((${t.right}) - ${i})`; };
    return { p1: pos(l), p2: pos(r) };
  }
  return { E, W, SG, ext, idx, dynSlice, psLo, psLoRun };
}
