// Silinx ASM charts - two charts compared by their structure (#405: out of core/asm-from-hdl.js): the same states,
// decisions, outputs and paths, whatever their ids, positions and spellings.
import { exitsOf } from './asm-layout.js';
import { exprToString, normalizeModel, parseAction, parseCondition } from './asm.js';
import {
  canon
} from './asm-from-hdl.js';

// ---------------------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------------------

/** True if both charts describe the same machine (ids, positions and spelling ignored). */
export function sameAsmStructure(a, b) {
  const A = normalizeModel(a), B = normalizeModel(b);
  // charts with case boxes are compared as JSON (the comparison below knows decisions only)
  if ([...A.nodes, ...B.nodes].some((n) => n.type === 'case')) return JSON.stringify(A) === JSON.stringify(B);
  if (A.name !== B.name || A.clock !== B.clock || A.encoding !== B.encoding) return false;
  if (A.reset.name !== B.reset.name || A.reset.active !== B.reset.active || A.reset.sync !== B.reset.sync) return false;
  const ports = (m) => JSON.stringify([
    m.inputs.map((p) => [p.name, p.width]),
    m.outputs.map((p) => { const r = parseCondition(p.default); return [p.name, p.width, p.registered, r.error ? p.default : String(r.ast.v)]; }),
  ]);
  if (ports(A) !== ports(B)) return false;
  const extras = (m) => JSON.stringify([
    (m.generics || []).map((g) => [g.name, g.default]),
    m.inputs.map((p) => !!p.sync),
    (m.registers || []).map((r) => { const q = parseCondition(r.init); return [r.name, r.width, q.error ? r.init : String(q.ast.v)]; }),
  ]);
  if (extras(A) !== extras(B)) return false;
  const W = new Map([...A.inputs, ...A.outputs, ...(A.registers || [])].map((p) => [p.name, p.width]));
  const wOf = (n) => W.get(n) ?? 1;
  const sum = (m) => {
    const byId = new Map(m.nodes.map((n) => [n.id, n]));
    const ex = exitsOf(m);
    const states = new Map();
    for (const s of m.nodes.filter((n) => n.type === 'state')) {
      states.set(s.name, { moore: s.actions.map((x) => actKey(x, wOf)), root: (ex.get(s.id) || {}).next });
    }
    return { byId, ex, states, initial: byId.get(m.initial)?.name };
  };
  const SA = sum(A), SB = sum(B);
  if (SA.initial !== SB.initial || SA.states.size !== SB.states.size) return false;
  for (const [name, sa] of SA.states) {
    const sb = SB.states.get(name);
    if (!sb || JSON.stringify(sa.moore) !== JSON.stringify(sb.moore)) return false;
    // compare behaviour of the two blocks on every combination of their decisions
    const atoms = new Map();
    const collect = (S, id, seen) => {
      const n = S.byId.get(id);
      if (!n || n.type === 'state' || seen.has(id)) return;
      seen.add(id);
      const e = S.ex.get(id) || {};
      if (n.type === 'decision') {
        const k = atomOf(n.cond, wOf).key;
        if (!atoms.has(k)) atoms.set(k, atoms.size);
        collect(S, e.true, seen); collect(S, e.false, seen);
      } else collect(S, e.next, seen);
    };
    collect(SA, sa.root, new Set());
    collect(SB, sb.root, new Set());
    if (atoms.size > 16) return false;
    const run = (S, root, bitsv) => {
      const acts = new Map();
      let id = root;
      for (let guard = 0; guard < 1000; guard++) {
        const n = S.byId.get(id);
        if (!n) return null;
        if (n.type === 'state') return JSON.stringify([n.name, [...acts].sort()]);
        const e = S.ex.get(id) || {};
        if (n.type === 'decision') {
          const at = atomOf(n.cond, wOf);
          const v = ((bitsv >> atoms.get(at.key)) & 1) === 1;
          id = (v !== at.neg) ? e.true : e.false;
        } else {
          for (const x of n.actions) { const [t, val] = actKey(x, wOf).split('\u0000'); acts.set(t, val); }
          id = e.next;
        }
      }
      return null;
    };
    for (let v = 0; v < 1 << atoms.size; v++) {
      if (run(SA, sa.root, v) !== run(SB, sb.root, v)) return false;
    }
  }
  // every-cycle blocks: same names in the same order, same final assignments on every path
  const blocksOf = (m) => m.nodes.filter((n) => n.type === 'always');
  const BA = blocksOf(A), BB = blocksOf(B);
  if (BA.length !== BB.length) return false;
  for (let i = 0; i < BA.length; i++) {
    if (BA[i].name !== BB[i].name) return false;
    const atoms = new Map();
    const collect = (S, id, seen) => {
      const n = S.byId.get(id);
      if (!n || n.type === 'state' || n.type === 'always' || seen.has(id)) return;
      seen.add(id);
      const e = S.ex.get(id) || {};
      if (n.type === 'decision') {
        const k = atomOf(n.cond, wOf).key;
        if (!atoms.has(k)) atoms.set(k, atoms.size);
        collect(S, e.true, seen); collect(S, e.false, seen);
      } else collect(S, e.next, seen);
    };
    collect(SA, (SA.ex.get(BA[i].id) || {}).next, new Set());
    collect(SB, (SB.ex.get(BB[i].id) || {}).next, new Set());
    if (atoms.size > 16) return false;
    const run = (S, head, bitsv) => {
      const acts = new Map();
      const apply = (list) => { for (const x of list) { const [t, val] = actKey(x, wOf).split('\u0000'); acts.set(t, val); } };
      apply(head.actions);
      let id = (S.ex.get(head.id) || {}).next;
      for (let guard = 0; guard < 1000; guard++) {
        const n = S.byId.get(id);
        if (!n) return JSON.stringify([...acts].sort());
        if (n.type === 'state' || n.type === 'always') return null;
        const e = S.ex.get(id) || {};
        if (n.type === 'decision') {
          const at = atomOf(n.cond, wOf);
          const v = ((bitsv >> atoms.get(at.key)) & 1) === 1;
          id = (v !== at.neg) ? e.true : e.false;
        } else { apply(n.actions); id = e.next; }
      }
      return null;
    };
    for (let v = 0; v < 1 << atoms.size; v++) if (run(SA, BA[i], v) !== run(SB, BB[i], v)) return false;
  }
  return true;
}

function atomOf(cond, wOf) {
  const p = parseCondition(cond);
  if (p.error) return { key: cond, neg: false };
  const c = canon(p.ast, wOf);
  if (c.k === 'un' && c.op === '!') return { key: exprToString(c.a), neg: true };
  if (c.k === 'bin' && c.op === '!=') return { key: exprToString({ ...c, op: '==' }), neg: true };
  return { key: exprToString(c), neg: false };
}

function actKey(text, wOf) {
  const p = parseAction(text);
  if (p.error) return `${text}\u0000`;
  return `${p.target}\u0000${exprToString(canon(p.ast, wOf))}`;
}
