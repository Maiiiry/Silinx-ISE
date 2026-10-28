// Silinx HLS (#1779): a table computed at synthesis, as Vitis HLS computes one into a ROM. A call (a statement of its
// own, in a synthesized function's body) of a function that only writes its array arguments from constants (it reads
// neither them nor any other argument, no global but a constant, calls no function but math.h's) is run by the C
// simulation (core/c-interp.js) at synthesis: its values become the arrays' initial ones, each array constant (a ROM)
// when nothing else writes it; the call is dropped. So math.h's functions and float arithmetic of any kind may fill a
// table, its values exactly the C simulation's. Before core/c-dataflow.js and core/c-fsmd.js. Isomorphic ES module.
//
//   foldTables(checked) -> the names of the tables folded ('function:array')
import { runAtSynthesis } from './c-interp.js';
import { MATH } from './c-float.js';

const walk = (n, f) => {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((x) => walk(x, f)); return; }
  f(n);
  for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, f);
};

/** Whether fn only writes its parameters (arrays), from constants: no read of a parameter, no global but constants, no
 *  call but math.h's. */
function pureInit(fn, globals) {
  if (!fn?.body || !fn.params.length || fn.params.some((p) => p.type.kind !== 'array' && p.type.kind !== 'ptr')) return false;
  const params = new Set(fn.params.map((p) => p.name));
  const locals = new Set();
  walk(fn.body, (n) => { if (n.kind === 'var') locals.add(n.name); if (n.kind === 'decl') n.vars.forEach((v) => locals.add(v.name)); });
  let ok = true;
  const written = new Set();
  walk(fn.body, (n) => {
    if (n.kind === 'assign' && n.l.kind === 'index' && n.l.e.kind === 'id' && params.has(n.l.e.name)) written.add(n.l);
    if (n.kind === 'call' && !(n.callee.kind === 'id' && MATH[n.callee.name])) ok = false;
    if (n.kind === 'pragma') return;
  });
  walk(fn.body, (n) => {
    if (n.kind === 'index' && n.e.kind === 'id' && params.has(n.e.name) && !written.has(n)) ok = false;   // (a parameter read)
    if (n.kind === 'id' && !params.has(n.name) && !locals.has(n.name) && !MATH[n.name]) {
      const g = globals.get(n.name);
      if (!g || !g.const) ok = false;
    }
  });
  return ok;
}

/** The text of a value as a literal of its type (a float's: the double nearest it, exactly). */
const literal = (v, t, loc) => (typeof v === 'number'
  ? { kind: 'float', text: Number.isFinite(v) ? (Object.is(v, -0) ? '-0.0' : v.toPrecision(17)) : v > 0 ? '1e999' : '-1e999', loc }
  : { kind: 'num', value: BigInt(v), text: String(v), loc });

export function foldTables(checked) {
  const { funcs } = checked;
  const globals = new Map(checked.ast.items.filter((it) => it.kind === 'var').map((it) => [it.name, it]));
  const done = [];
  for (const g of funcs.values()) {
    if (!g.body || g.name === 'main') continue;
    const items = g.body.items;
    const decls = new Map();
    walk(g.body, (n) => { if (n.kind === 'decl') for (const v of n.vars) if (v.type.kind === 'array') decls.set(v.name, v); });
    items.forEach((st, k) => {
      const e = st.kind === 'expr' ? st.e : null;
      if (!(e?.kind === 'call' && e.callee.kind === 'id')) return;
      const fn = funcs.get(e.callee.name);
      if (!fn || !e.args.length || !e.args.every((a) => a.kind === 'id' && decls.has(a.name) && !decls.get(a.name).init)) return;
      if (!pureInit(fn, globals)) return;
      // (the arrays written nowhere else in g)
      const names = new Set(e.args.map((a) => a.name));
      let other = false;
      walk(items.filter((x) => x !== st), (n) => {
        if (n.kind === 'assign' && n.l.kind === 'index' && n.l.e.kind === 'id' && names.has(n.l.e.name)) other = true;
        if ((n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) && n.e.kind === 'index' && n.e.e.kind === 'id' && names.has(n.e.e.name)) other = true;
        if (n.kind === 'call') for (const a of n.args) if (a.kind === 'id' && names.has(a.name)) other = true;
      });
      if (other) return;
      const vs = runAtSynthesis(checked, fn, e.args.map((a) => decls.get(a.name)));
      if (!vs) return;
      e.args.forEach((a, i) => {
        const v = decls.get(a.name);
        v.init = { kind: 'init', items: vs[i].map((x) => literal(x, v.type, v.loc)), loc: v.loc };
        v.const = true;
        done.push(`${g.name}:${a.name}`);
      });
      items[k] = { kind: 'empty', loc: st.loc };
    });
  }
  return done;
}
