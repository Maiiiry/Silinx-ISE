// Silinx ASM charts from HDL - the text candidates (#405: out of asmFromHdl in core/asm-from-hdl.js): the spelling
// of each state's conditions and actions as the generator's header or the previous chart wrote them, the decision
// order they give, and the case boxes they list.
import { extractAlwaysBlocks, extractTransitions, parseCondition } from './asm.js';
import { condKey, condNegKey } from './asm-from-hdl.js';

/** { candOf, rankOf } of asmFromHdl. */
export function mountTextCandidates(ctx) {
  const {
    A, header, prev
  } = ctx;

  // ---- text candidates (generator header, previous chart) -------------------------------
  const cands = new Map(); // state name (lower) -> { moore: [[...]], conds: [], mealy: [] }
  const candOf = (name) => {
    const k = name.toLowerCase();
    if (!cands.has(k)) cands.set(k, { moore: [], conds: [], mealy: [] });
    return cands.get(k);
  };
  if (header) {
    for (const [name, h] of header.states) {
      const c = candOf(name);
      if (h.moore) c.moore.push(h.moore);
      c.conds.push(...h.conds);
      c.mealy.push(...h.mealy);
    }
    for (const [name, h] of header.always) {
      const c = candOf(`@${name}`);
      c.moore.push(h.actions);
      c.conds.push(...h.conds);
      c.mealy.push(...h.mealy);
    }
  }
  if (prev) {
    try {
      for (const st of extractTransitions(prev)) {
        const c = candOf(st.name);
        c.moore.push(st.mooreActions);
        for (const t of st.transitions) {
          for (const x of t.conditions) c.conds.push(x.cond.trim());
          for (const x of t.mealyActions) c.mealy.push(x.action);
        }
      }
    } catch { /* an invalid previous chart only loses its texts */ }
    try {
      for (const b of extractAlwaysBlocks(prev)) {
        const c = candOf(`@${b.name}`);
        c.moore.push(b.actions);
        for (const p of b.paths) {
          for (const x of p.conditions) c.conds.push(x.cond.trim());
          for (const x of p.actions) c.mealy.push(x.action);
        }
      }
    } catch { /* idem */ }
  }
  // decision order per state (header / previous chart): used to stack merged decisions
  const rankOf = (stateName) => {
    const r = new Map();
    for (const t of candOf(stateName).conds) {
      const p = parseCondition(t);
      if (p.error) continue;
      for (const k of [condKey(p.ast, A.asmWidth), condNegKey(p.ast, A.asmWidth)]) if (!r.has(k)) r.set(k, r.size);
    }
    return (ast) => r.get(condKey(ast, A.asmWidth)) ?? Infinity;
  };

  // case boxes listed by the header / previous chart (`<expr> = <label>` conditions)
  A.caseExprs = new Set();
  for (const c of cands.values()) for (const t of c.conds) { const m = /^(.+?) = (?!=)/.exec(t); if (m) A.caseExprs.add(m[1].trim()); }

  return { candOf, rankOf };
}
