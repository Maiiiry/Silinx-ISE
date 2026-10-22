// Silinx - the compiled simulator's clocked and asynchronous elements (#405: out of compileNetlist in
// core/compiled-sim.js): the code of a flip-flop's, a memory port's or a latch's sample, commit and asynchronous part.
import { bigOf, fix32, int, lit, mB, mN, pbits } from './compiled-helpers.js';

/** { async, commit, pol, sample, vk } of compileNetlist. */
export function mountElements(ctx) {
  const {
    rdExpr, sig, vars
  } = ctx;

  // ---- the clocked and asynchronous elements
  // (each clocked one: sample, from the values before the edge, into n<id>; then commit)
  const vk = e => vars[e.q].kind;
  const cst = (bits, kind) => lit(bigOf(bits), kind);
  const pol = (e, p) => int(e.P[p] ?? 1);
  const act = (e, port, p) => `${sig(e.C[port], 'n')} === ${pol(e, p)}`;
  // a vector of per-bit active signals (SET / CLR of $dffsr) as a mask
  const actMask = (e, port, p, w, kind) => {
    const s = sig(e.C[port], kind);
    if (pol(e, p)) return s;
    return kind === 'b' ? `(~${s} & ${(1n << BigInt(w)) - 1n}n)` : mN(`~${s}`, w);
  };
  function sample(e) {
    const q = `v${e.q}`, nn = `n${e.id}`;
    if (e.type === '$memwr') {
      const m = e.mem;
      return `a${e.id} = ${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}; ${nn} = ${sig(e.data, m.kind)}; w${e.id} = ${sig(e.en, m.kind)};`;
    }
    const kind = vk(e), w = vars[e.q].w;
    const d = () => sig(e.C.D, kind);
    const en = () => act(e, 'EN', 'EN_POLARITY');
    const val = p => cst(pbits(e.P[p]).slice(0, w), kind);
    let x;
    switch (e.type) {
      case '$dff': x = d(); break;
      case '$dffe': x = `(${en()} ? ${d()} : ${q})`; break;
      case '$adff': x = `(${act(e, 'ARST', 'ARST_POLARITY')} ? ${val('ARST_VALUE')} : ${d()})`; break;
      case '$adffe': x = `(${act(e, 'ARST', 'ARST_POLARITY')} ? ${val('ARST_VALUE')} : ${en()} ? ${d()} : ${q})`; break;
      case '$sdff': x = `(${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${d()})`; break;
      case '$sdffe': x = `(${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${en()} ? ${d()} : ${q})`; break;
      case '$sdffce': x = `(${en()} ? (${act(e, 'SRST', 'SRST_POLARITY')} ? ${val('SRST_VALUE')} : ${d()}) : ${q})`; break;
      case '$aldff': x = `(${act(e, 'ALOAD', 'ALOAD_POLARITY')} ? ${sig(e.C.AD, kind)} : ${d()})`; break;
      case '$aldffe': x = `(${act(e, 'ALOAD', 'ALOAD_POLARITY')} ? ${sig(e.C.AD, kind)} : ${en()} ? ${d()} : ${q})`; break;
      case '$dffsr': case '$dffsre': {
        const base = e.type === '$dffsre' ? `(${en()} ? ${d()} : ${q})` : d();
        const set = actMask(e, 'SET', 'SET_POLARITY', w, kind), clr = actMask(e, 'CLR', 'CLR_POLARITY', w, kind);
        x = kind === 'b' ? `((${base} | ${set}) & ~${clr})` : fix32(`((${base} | ${set}) & ~${clr})`, w);
        break;
      }
      case '$memrd': {
        const m = e.mem;
        let rd = rdExpr(m, e.addr, kind);
        // a transparent port reads what a write port of the same edge writes at its address
        e.transparent.forEach((tr, j) => {
          if (!tr) return;
          const wr = m.writes[j];
          const wa = `${sig(wr.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}`, wd = sig(wr.data, kind), we = sig(wr.en, kind);
          const merged = kind === 'b' ? `((r & ~we) | (${wd} & we))` : `(((r & ~we) | (${wd} & we)) >>> 0)`;
          rd = `((r, we) => (${sig(e.addr, 'n')}${m.offset ? ` - ${m.offset}` : ''}) === (${wa}) ? ${kind === 'b' ? mB(merged, w) : merged} : r)(${rd}, ${we})`;
        });
        const en1 = `${sig(e.C.EN, 'n')} === 1`, srst = `${sig(e.C.SRST, 'n')} === 1`;
        const srstV = lit(e.srst, kind), arstV = lit(e.arst, kind);
        x = e.ceOverSrst ? `(${en1} ? (${srst} ? ${srstV} : ${rd}) : ${q})` : `(${srst} ? ${srstV} : ${en1} ? ${rd} : ${q})`;
        x = `(${sig(e.C.ARST, 'n')} === 1 ? ${arstV} : ${x})`;
        break;
      }
      default: return '';   // latches: asynchronous only
    }
    return `${nn} = ${x};`;
  }
  // (flag: a memory write on the main clock, its dirty bit set (@@set m<memory>@@, as generate writes it))
  function commit(e, flag = false) {
    if (e.type === '$memwr') {
      const m = e.mem, k = `m${m.k}`, a = `a${e.id}`, we = `w${e.id}`;
      const zero = lit(0, m.kind);
      const merged = m.kind === 'b' ? `(${k}[${a}] & ~${we}) | (n${e.id} & ${we})` : `(${k}[${a}] & ~${we}) | (n${e.id} & ${we})`;
      return `if (${we} !== ${zero} && ${a} >= 0 && ${a} < ${m.size}) ${flag ? `{ ${k}[${a}] = ${merged}; @@set m${m.k}@@ }` : `${k}[${a}] = ${merged};`}`;
    }
    if (e.type === '$dlatch' || e.type === '$adlatch') return '';
    return `v${e.q} = n${e.id};`;
  }
  // the asynchronous part of an element: brings it to its value now; ch = true when it changed
  function async(e) {
    const q = `v${e.q}`;
    const kind = e.q != null ? vk(e) : null, w = e.q != null ? vars[e.q].w : 0;
    const val = p => cst(pbits(e.P[p]).slice(0, w), kind);
    const set = (cond, v) => `if (${cond} && ${q} !== ${v}) { ${q} = ${v}; ch = true; }`;
    switch (e.type) {
      case '$adff': case '$adffe': return set(act(e, 'ARST', 'ARST_POLARITY'), val('ARST_VALUE'));
      case '$aldff': case '$aldffe': return `{ const t = ${sig(e.C.AD, kind)}; ${set(act(e, 'ALOAD', 'ALOAD_POLARITY'), 't')} }`;
      case '$dffsr': case '$dffsre': {
        const s = actMask(e, 'SET', 'SET_POLARITY', w, kind), c = actMask(e, 'CLR', 'CLR_POLARITY', w, kind);
        const t = kind === 'b' ? `((${q} | ${s}) & ~${c})` : fix32(`((${q} | ${s}) & ~${c})`, w);
        return `{ const t = ${t}; if (t !== ${q}) { ${q} = t; ch = true; } }`;
      }
      case '$dlatch': return `{ const t = ${sig(e.C.D, kind)}; ${set(act(e, 'EN', 'EN_POLARITY'), 't')} }`;
      case '$adlatch': return `if (${act(e, 'ARST', 'ARST_POLARITY')}) { ${set('true', val('ARST_VALUE'))} } else { const t = ${sig(e.C.D, kind)}; ${set(act(e, 'EN', 'EN_POLARITY'), 't')} }`;
      case '$memrd': return set(`${sig(e.C.ARST, 'n')} === 1`, lit(e.arst, kind));
    }
    return '';
  }

  return { async, commit, pol, sample, vk };
}
