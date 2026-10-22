// Silinx ASM charts from HDL - the input synchronisers (#405: out of analyzeModule in core/asm-hdl-analysis.js):
// two flip-flops in a row on an input (m <= in; s <= m;, reset to 0), recognised as the generator writes them.
import { stripConv, walkExpr, walkStmts } from './asm-hdl-util.js';

/** { syncOf, syncRegs } of analyzeModule. */
export function mountSynchronisers(ctx) {
  const {
    clock, clocked, comb, concs, constValue, drivers, orig, ports, reset, resetVals, signals, widthOfType
  } = ctx;

  // ---- input synchronisers: `m <= in; s <= m;` (2 flip-flops, reset to 0) ----------------
  const refCount = new Map();
  const countRefs = (e) => walkExpr(e, (x) => { if (x.op === 'ref') refCount.set(x.name, (refCount.get(x.name) || 0) + 1); });
  const countStmts = (list) => walkStmts(list, (st) => {
    for (const e of [st.cond, st.value, st.expr]) countRefs(e);
    if (st.kind === 'case') for (const it of st.items) for (const ch of it.choices) if (ch && ch.op) countRefs(ch);
  });
  for (const c of clocked) countStmts(c.load);
  for (const p of comb) countStmts(p.body);
  for (const a of concs) countRefs(a.value);
  const loadOf = new Map(); // register -> value of its unconditional load
  for (const c of clocked) for (const st of c.load) if (st.kind === 'assign' && st.target.op === 'ref') loadOf.set(st.target.name, stripConv(st.value));
  const zeroReset = (r) => { const rv = resetVals.get(r); return !!rv && constValue(rv.value, 1) === 0n; };
  const syncOf = new Map(); // input -> { meta, sync }
  const syncRegs = new Map(); // register -> { kind: 'syncmeta'|'syncout', input }
  for (const [M, v] of loadOf) {
    if (v.op !== 'ref' || ports.get(v.name)?.dir !== 'in' || v.name === clock || v.name === reset.name) continue;
    const P = v.name;
    if (ports.has(M) || syncOf.has(P) || refCount.get(P) !== 1 || refCount.get(M) !== 1 || drivers.get(M)?.kind !== 'clocked') continue;
    const Y = [...loadOf].find(([, x]) => x.op === 'ref' && x.name === M)?.[0];
    if (!Y || ports.has(Y) || !zeroReset(M) || !zeroReset(Y)) continue;
    const w = ports.get(P).width;
    if ([M, Y].some((r) => !signals.has(r) || widthOfType(signals.get(r).type, `signal '${orig(r)}'`, signals.get(r).loc) !== w)) continue;
    syncOf.set(P, { meta: M, sync: Y });
    syncRegs.set(M, { kind: 'syncmeta', input: P });
    syncRegs.set(Y, { kind: 'syncout', input: P });
  }

  return { syncOf, syncRegs };
}
