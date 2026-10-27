// Silinx (#1530): HDL to C, the statements (out of hdlToC in core/hdl-c.js): the C of a process's or a function's body
// (core/elaborate.js's statements): a signal assigned into nx (the next values: VHDL's signals, Verilog's nonblocking
// assignments) or now and into nx (a blocking one), a variable now; the functions as C functions. Isomorphic.
import { bitpos } from './interp.js';

/** { S, fnOf, fnTexts, take } of hdlToC (G: its fields by signal, isArr, fail, hex, id, name and the expressions). */
export function mountStmts(G) {
  const { field, isArr, fail, hex, id, name, E, W, SG, ext, idx, dynSlice } = G;

  // ---------------- statements: the C of a process's body; a signal written into nx (the next values), a variable now
  let lines = [];
  // ---------------- the functions: a C function each (its variables a frame of its own, made at each call)
  const fnNames = new Map(), fnTexts = [], making = new Set();
  function fnOf(f) {
    if (fnNames.has(f)) return fnNames.get(f);
    if (making.has(f)) fail(`'${f.name}' calls itself: recursion cannot be modelled`, f);
    making.add(f);
    const nm = `ap_f${fnNames.size}_${id(f.name || 'fn')}`;
    const fr = f.frameInit ? f.frameInit() : [];
    const saved = lines;
    lines = [];
    const fctx = {
      clockedPhase: false,
      local: (x) => { if (x.up != null) fail('a variable of an enclosing subprogram', x); return `v[${x.i}]`; },
      var: (i) => `v[${i}]`,
      ret: (x) => (x ? `return ${ext(x, fctx, f.retT.w, SG(x))};` : 'return 0;'),
    };
    S(f.body, fctx, '  ');
    const body = lines;
    lines = saved;
    const T = `${id(name)}_t`;
    fnTexts.push(`/* function ${f.name} */`, `static uint64_t ${nm}(${T} *s${f.params.map((p, k) => `, uint64_t a${k}`).join('')}) {`,
      `  uint64_t v[${Math.max(1, fr.length)}] = { ${fr.length ? fr.map((x) => (x && x.v !== undefined ? hex(x.x ? BigInt(x.v) & ~BigInt(x.x) : x.v, x.w || 64) : '0')).join(', ') : '0'} };`,
      '  (void)s;', ...f.params.map((p, k) => `  v[${p.i}] = a${k};`), ...body, `  return ${f.retSlot != null ? `v[${f.retSlot}]` : '0'};`, '}', '');
    making.delete(f);
    fnNames.set(f, nm);
    return nm;
  }
  function lv(L, ctx) {   // { get: text read now, set: (value text, value width, sign) -> statement text }
    switch (L.k) {
      case 'sig': {
        if (isArr(L.sig)) fail(`the whole array '${L.sig.name}' assigned: only its elements can be modelled`, L);
        const f = field.get(L.sig), w = L.sig.t.w;
        return { w, set: (v, nb) => (nb ? `nx->${f} = ${v};` : `s->${f} = nx->${f} = ${v};`), base: (nb) => (nb ? `nx->${f}` : `s->${f}`), whole: true };
      }
      case 'loc': return { w: L.t.w, set: (v) => `${ctx.local(L)} = ${v};`, base: () => ctx.local(L), whole: true, local: true };
      case 'bit': case 'slice': case 'dslice': {
        const b = lv(L.base, ctx);
        let lo, w;
        if (L.k === 'bit') {
          if (L.index.k !== 'c') {
            const i = idx(L.index, ctx);
            lo = L.base.t.desc ? `(${i} - (${L.base.t.right}))` : `((${L.base.t.right}) - ${i})`;
          } else lo = bitpos(L.base.t, Number(L.index.val.v));
          w = 1;
        } else if (L.k === 'slice') { lo = L.lo; w = L.t.w; } else if (L.left.k === 'c' && L.right.k === 'c') {
          lo = Math.min(bitpos(L.base.t, Number(L.left.val.v)), bitpos(L.base.t, Number(L.right.val.v))); w = L.t.w;
        } else {
          const d = dynSlice(L.base.t, L.left, L.right, ctx);
          lo = `(${d.p1} < ${d.p2} ? ${d.p1} : ${d.p2})`; w = L.t.w;
        }
        const m = `ap_m(~0ULL, ${w})`;
        // (a position known at run time: written only inside the value, as the simulator does, #1530)
        const dyn = typeof lo !== 'number';
        const at = dyn ? 'ap_b' : lo;
        return { w, set: (v, nb) => {
          const t = b.base(nb);
          const upd = `(${t} & ~(${m} << ${at})) | (ap_m(${v}, ${w}) << ${at})`;
          const st = b.local ? b.set(`ap_m(${upd}, ${b.w})`) : nb ? `${t} = ap_m(${upd}, ${b.w});` : `s->${t.slice(3)} = nx->${t.slice(3)} = ap_m(${upd}, ${b.w});`;
          return dyn ? `{ int64_t ap_b = ${lo}; if (ap_b >= 0 && ap_b + ${w} <= ${b.w}) ${st} }` : st;
        } };
      }
      case 'elem': {
        const a = L.base;
        if (a.k !== 'sig' || !isArr(a.sig)) fail('an element of an array that is not a signal', L);
        const f = field.get(a.sig), i = `(${idx(L.index, ctx)} - (${a.sig.t.lo ?? 0}))`;
        return { w: a.sig.t.elem.w, set: (v, nb) => `{ int64_t ap_i = ${i}; if ((uint64_t)ap_i < ${a.sig.t.len}) ${nb ? `nx->${f}[ap_i]` : `s->${f}[ap_i] = nx->${f}[ap_i]`} = ${v}; }`, whole: true };
      }
      case 'cat': {
        const parts = L.parts.map((p) => lv(p, ctx));
        const total = parts.reduce((a, p) => a + p.w, 0);
        return { w: total, cat: parts };
      }
      default: fail(`an assignment to '${L.k}' cannot be modelled`, L);
    }
    return null;
  }
  function S(s, ctx, ind) {
    if (!s) return;
    switch (s.k) {
      case 'blk': for (const x of s.stmts || []) S(x, ctx, ind); return;
      case 'null': return;
      case 'asg': {
        if (s.delay && s.delay.k !== 'c') fail('an assignment with a delay that is not a constant', s);
        const nb = !!s.nb && s.target.k !== 'loc';
        const T = lv(s.target, ctx);
        const vw = W(s.value), vs = SG(s.value), vx = E(s.value, ctx);
        if (T.cat) {
          lines.push(`${ind}{ uint64_t ap_v = ap_x(${vx}, ${vw}, ${T.w}, ${vs ? 1 : 0});`);
          let off = T.w;
          for (const p of T.cat) { off -= p.w; lines.push(`${ind}  ${p.set(`ap_m(ap_v >> ${off}, ${p.w})`, nb)}`); }
          lines.push(`${ind}}`);
          return;
        }
        lines.push(`${ind}${T.set(vw === T.w && (!vs || T.w === vw) ? vx : `ap_x(${vx}, ${vw}, ${T.w}, ${vs ? 1 : 0})`, nb)}`);
        return;
      }
      case 'if':
        lines.push(`${ind}if ((${E(s.c, ctx)}) != 0) {`);
        S(s.then, ctx, `${ind}  `);
        if (s.else) { lines.push(`${ind}} else {`); S(s.else, ctx, `${ind}  `); }
        lines.push(`${ind}}`);
        return;
      case 'case': {
        const sel = s.sel, sw = W(sel);
        let first = true;
        const cond = (ch) => {
          if (ch.range) {
            const v = `ap_s(${ext(sel, ctx, 64, !!sel.t.s)}, 64)`;
            const a = E(ch.range.lo, ctx), b = E(ch.range.hi, ctx);
            return `(${v} >= (int64_t)${a} && ${v} <= (int64_t)${b}) || (${v} >= (int64_t)${b} && ${v} <= (int64_t)${a})`;
          }
          const cw = Math.max(sw, W(ch), s.cw || 0), sg = s.ss === undefined ? null : !!s.ss;
          if (ch.k === 'c' && (s.variant === 'z' || s.variant === 'x') && ch.val.x) {
            const care = hex(~BigInt(ch.val.x), cw);
            return `((${ext(sel, ctx, cw, sg ?? SG(sel))} & ${care}) == (${ext(ch, ctx, cw, sg ?? SG(ch))} & ${care}))`;
          }
          return `${ext(sel, ctx, cw, sg ?? SG(sel))} == ${ext(ch, ctx, cw, sg ?? SG(ch))}`;
        };
        for (const it of s.items) {
          lines.push(`${ind}${first ? '' : '} else '}if (${it.choices.map(cond).join(' || ')}) {`);
          first = false;
          S(it.body, ctx, `${ind}  `);
        }
        if (s.def) { lines.push(first ? `${ind}{` : `${ind}} else {`); S(s.def, ctx, `${ind}  `); first = false; }
        if (!first) lines.push(`${ind}}`);
        return;
      }
      case 'for':
        lines.push(`${ind}{`);
        S(s.init, ctx, `${ind}  `);
        lines.push(`${ind}  for (int ap_g = 0; (${E(s.cond, ctx)}) != 0; ) {`, `${ind}    if (++ap_g > 1000000) break;`);
        S(s.body, ctx, `${ind}    `);
        S(s.step, ctx, `${ind}    `);
        lines.push(`${ind}  }`, `${ind}}`);
        return;
      case 'forrange': {
        const a = E(s.from, ctx), b = E(s.to, ctx), v = ctx.var(s.var, s.varT);
        lines.push(`${ind}for (int64_t ap_k = ap_s(${a}, ${W(s.from)}); ${s.down ? `ap_k >= ap_s(${b}, ${W(s.to)})` : `ap_k <= ap_s(${b}, ${W(s.to)})`}; ap_k${s.down ? '--' : '++'}) {`, `${ind}  ${v} = ap_m((uint64_t)ap_k, ${s.varT.w});`);
        S(s.body, ctx, `${ind}  `);
        lines.push(`${ind}}`);
        return;
      }
      case 'while':
        lines.push(`${ind}for (int ap_g = 0; (${E(s.cond, ctx)}) != 0; ) {`, `${ind}  if (++ap_g > 1000000) break;`);
        S(s.body, ctx, `${ind}  `);
        lines.push(`${ind}}`);
        return;
      case 'exit': case 'next':
        if (s.label) fail(`a ${s.k} of a labelled loop`, s);
        lines.push(`${ind}${s.c ? `if ((${E(s.c, ctx)}) != 0) ` : ''}${s.k === 'exit' ? 'break' : 'continue'};`);
        return;
      case 'ret': if (!ctx.ret) fail('a return outside a function', s); lines.push(`${ind}${ctx.ret(s.value)}`); return;
      case 'report': case 'assert': return;   // (no messages in the model)
      case 'wait': case 'delay': case 'event': fail('a wait (a test bench\'s): it cannot be modelled', s); break;
      default: fail(`the statement '${s.k}' cannot be modelled yet`, s);
    }
  }

  /** The lines written since the last take. */
  const take = () => { const t = lines; lines = []; return t; };
  return { S, fnOf, fnTexts, take };
}
