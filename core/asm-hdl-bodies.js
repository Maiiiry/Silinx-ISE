// Silinx ASM charts from HDL - the logic bodies (#405: out of analyzeModule in core/asm-hdl-analysis.js): the
// combinational and clocked statements to read the chart from, the every-cycle blocks (by the generator's marks or
// the statements free of the state), and their names.
import { lineOf, stmtList, stripConv, walkExpr, walkStmts } from './asm-hdl-util.js';
import { everyCycleMarks } from './asm-hdl-analysis.js';

/** { alwaysGroups, bodies } of analyzeModule. */
export function mountLogicBodies(ctx) {
  const {
    lang, src, N, S, clocked, comb, concs, constValue, consumed, nextOfReg, outInfo, roles, syncRegs
  } = ctx;

  // ---- logic bodies --------------------------------------------------------------------
  const bodies = []; // { stmts, ctx: 'comb'|'clocked', loc }
  const alwaysGroups = []; // every-cycle blocks: { name, stmts, ctx }
  const marks = everyCycleMarks(src, lang);
  const stateFree = (st) => {
    let ok = true;
    const noS = (e) => walkExpr(e, (x) => { if (x.op === 'ref' && x.name === S) ok = false; });
    walkStmts([st], (x) => {
      if (!['assign', 'if', 'case', 'null'].includes(x.kind)) ok = false;
      if (x.kind === 'assign' && (x.target.op !== 'ref' || x.target.name === S || x.target.name === N)) ok = false;
      for (const e of [x.cond, x.value, x.expr]) noS(e);
      if (x.kind === 'case') for (const it of x.items) for (const ch of it.choices) if (ch && ch.op) noS(ch);
    });
    return ok;
  };
  const addGroups = (stmts, ctx, procLine, nextLine) => {
    const mine = marks.filter((mk) => mk.line > procLine && mk.line < nextLine);
    let cur = null;
    for (const st of stmts) {
      const line = lineOf(st.loc) || 0;
      const mk = [...mine].reverse().find((x) => x.line < line);
      const name = mk ? mk.name : null;
      if (!cur || (mk && cur.mark !== mk)) {
        cur = { name, mark: mk || null, stmts: [], ctx, line: mk ? mk.line : line };
        alwaysGroups.push(cur);
      }
      cur.stmts.push(st);
    }
    // marks without statements: empty blocks
    for (const mk of mine) if (!alwaysGroups.some((g) => g.mark === mk)) alwaysGroups.push({ name: mk.name, mark: mk, stmts: [], ctx, line: mk.line });
  };
  const units = [...comb, ...clocked.map((c) => c.proc), ...concs].sort((a, b) => (lineOf(a.loc) || 0) - (lineOf(b.loc) || 0));
  const nextUnitLine = (it) => { const k = units.indexOf(it); return k >= 0 && k + 1 < units.length ? (lineOf(units[k + 1].loc) || Infinity) : Infinity; };
  for (const it of [...comb, ...clocked.map((c) => c.proc), ...concs].sort((a, b) => (lineOf(a.loc) || 0) - (lineOf(b.loc) || 0))) {
    if (it.kind === 'assign') {
      if (consumed.has(it)) continue;
      bodies.push({ stmts: [{ kind: 'assign', target: it.target, value: it.value, loc: it.loc }], ctx: 'comb', loc: it.loc });
      continue;
    }
    const ck = clocked.find((c) => c.proc === it);
    if (ck) {
      const rest = ck.load.filter((st) => !(st.kind === 'assign' && st.target.op === 'ref' &&
        ((st.target.name === S && N && st.value.op === 'ref' && st.value.name === N) ||
         (syncRegs.has(st.target.name) && stripConv(st.value).op === 'ref') ||
         (nextOfReg.has(st.target.name) && stripConv(st.value).op === 'ref' && stripConv(st.value).name === nextOfReg.get(st.target.name)))));
      // a clocked process that does not involve the state at all: an every-cycle block
      if (rest.length && rest.every(stateFree) && !ck.resetStmts.some((st) => st.target?.name === S)) {
        addGroups(rest, 'clocked', lineOf(it.loc) || 0, nextUnitLine(it));
        continue;
      }
      bodies.push({ stmts: rest, ctx: 'clocked', loc: it.loc });
      continue;
    }
    // combinational process: leading default assignments (up to the first every-cycle block)
    const list = stmtList(it.body);
    const procLine = lineOf(it.loc) || 0;
    const firstMark = marks.find((mk) => mk.line > procLine && mk.line < nextUnitLine(it))?.line ?? Infinity;
    const defaulted = new Set();
    let i = 0;
    for (; i < list.length; i++) {
      const st = list[i];
      if (st.kind !== 'assign' || st.target.op !== 'ref') break;
      if ((lineOf(st.loc) || 0) > firstMark || defaulted.has(st.target.name)) break;
      defaulted.add(st.target.name);
      const r = roles.get(st.target.name);
      if (r?.kind === 'next' && st.value.op === 'ref' && st.value.name === S) continue;
      if (r?.kind === 'reg' && stripConv(st.value).op === 'ref' && stripConv(st.value).name === outInfo.get(r.out).reg) continue;
      if (r?.kind === 'out') {
        const v = constValue(st.value, outInfo.get(r.out).width);
        if (v != null) { outInfo.get(r.out).default = v; continue; }
      }
      break;
    }
    // statements that do not depend on the state, before the state logic: every-cycle blocks
    // (the state logic after them takes priority, as in the chart)
    let j = i;
    while (j < list.length && stateFree(list[j])) j++;
    if (j > i || firstMark < Infinity) addGroups(list.slice(i, j), 'comb', procLine, nextUnitLine(it));
    bodies.push({ stmts: list.slice(j), ctx: 'comb', loc: it.loc });
  }
  alwaysGroups.sort((a, b) => a.line - b.line);
  // names of the blocks (the generator's comments, else every_cycle, every_cycle2, ...)
  const usedNames = new Set(alwaysGroups.filter((g) => g.name).map((g) => g.name.toLowerCase()));
  let anon = 0;
  for (const g of alwaysGroups) {
    if (g.name) continue;
    let nm;
    do { anon++; nm = anon === 1 ? 'every_cycle' : `every_cycle${anon}`; } while (usedNames.has(nm));
    usedNames.add(nm);
    g.name = nm;
  }

  return { alwaysGroups, bodies };
}
