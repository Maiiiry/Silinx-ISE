// Silinx ASM charts from HDL - the states (#405: out of analyzeModule in core/asm-hdl-analysis.js): the state
// register's states and their codes (an enumeration, or the constants it is compared with), the initial state, and
// the generics that are not state codes.
import { atLine, bitsValue, fail, walkExpr, walkStmts } from './asm-hdl-util.js';

/** { enumType, genericSet, generics, initial, sWidth, stateByKey, stateOfExpr, states } of analyzeModule. */
export function mountStates(ctx) {
  const {
    lang, mod, N, S, allBodies, clocked, concs, consts, orig, sDecl, sReset, types, widthOfType
  } = ctx;

  // ---- states --------------------------------------------------------------------------
  let states; // [{ key, name, code, index }]
  let enumType = false;
  let sWidth = null;
  const sType = sDecl.type;
  if (sType.kind === 'named' && types.get(sType.name)?.kind === 'enum') {
    enumType = true;
    states = types.get(sType.name).values.map((v, i) => ({ key: v, name: orig(v).replace(/^S_/i, '') || orig(v), code: BigInt(i) }));
  } else {
    sWidth = widthOfType(sType, `state signal '${orig(S)}'`, sDecl.loc);
    if (sWidth == null) fail(`state signal '${orig(S)}' must be an enumeration or a bit vector`);
    // constants related to the state: of the state subtype, or used with the state register
    const related = new Set();
    if (sType.kind === 'named') for (const [n, c] of consts) if (c.typeName === sType.name) related.add(n);
    const refOf = (e) => (e && e.op === 'ref' && consts.has(e.name) ? e.name : null);
    const visit = (st) => {
      if (st.kind === 'case' && st.expr.op === 'ref' && st.expr.name === S) for (const it of st.items) for (const ch of it.choices) { const r = refOf(ch); if (r) related.add(r); }
      if (st.kind === 'assign' && st.target.op === 'ref' && (st.target.name === S || st.target.name === N)) {
        walkExpr(st.value, (x) => { const r = refOf(x); if (r) related.add(r); });
      }
      for (const e of [st.cond, st.value]) walkExpr(e, (x) => {
        if (x.op === 'binary' && (x.o === '==' || x.o === '!=') && x.a.op === 'ref' && x.a.name === S) { const r = refOf(x.b); if (r) related.add(r); }
      });
    };
    for (const b of allBodies) walkStmts(b, visit);
    for (const c of clocked) walkStmts(c.resetStmts, visit);
    for (const a of concs) visit({ kind: 'assign', target: a.target, value: a.value });
    if (!related.size) fail(`the states of '${orig(S)}' must be named constants (${lang === 'vhdl' ? 'constant S_X : state_t := ...' : 'localparam S_X = ...'}) or an enumeration type`);
    states = [...related].sort((a, b) => consts.get(a).order - consts.get(b).order).map((n) => {
      const c = consts.get(n);
      if (c.value == null) fail(`state constant '${orig(n)}'${atLine(c.loc)} has no constant value`);
      return { key: n, name: orig(n).replace(/^S_/i, '') || orig(n), code: c.value };
    });
    const codes = new Set();
    for (const s of states) {
      if (codes.has(s.code)) fail(`state constants share the code ${s.code}: each state needs a distinct code`);
      codes.add(s.code);
    }
  }
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const stateOfExpr = (e) => {
    if (e.op === 'ref' && stateByKey.has(e.name)) return stateByKey.get(e.name);
    if (!enumType && (e.op === 'lit' || e.op === 'int')) {
      const v = e.op === 'lit' ? bitsValue(e.bits, 'state code') : BigInt(e.value);
      return states.find((s) => s.code === v) || null;
    }
    return null;
  };
  const initial = stateOfExpr(sReset.value);
  if (!initial) fail(`the reset value of '${orig(S)}'${atLine(sReset.loc)} is not one of its states`);

  // ---- generics: integer VHDL generics / Verilog parameters that are not state codes -----
  const generics = [];
  const genericSet = new Set();
  for (const p of mod.params || []) {
    if (p.local || stateByKey.has(p.name)) continue;
    const integer = lang === 'vhdl' ? p.type?.kind === 'integer' : (p.type == null || p.type.kind === 'integer');
    const v = consts.get(p.name)?.value;
    if (!integer || v == null || v < 0n || v > 2147483647n) continue;
    generics.push({ name: p.name, default: Number(v) });
    genericSet.add(p.name);
  }

  return { enumType, genericSet, generics, initial, sWidth, stateByKey, stateOfExpr, states };
}
