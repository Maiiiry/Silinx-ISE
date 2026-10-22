// Silinx - a gate-level model at word level again: the registers proposed (#405: out of wordLevel in
// core/compiled-words.js): the flip-flops of a chain's S or DI (or of the cells computing them), of one kind, in its
// order; and the flip-flops whose next values are outputs of one table (#659).
import { DEPTH, int, isConst } from './compiled-words.js';

/** { proposals } of wordLevel. */
export function mountRegisterProposals(ctx) {
  const {
    align, cellAt, cells, driver, ff1, ffKey, peel, pieces, sOf, segments
  } = ctx;

  // the registers: the flip-flops of a chain's S or DI (or of the cells computing them), of one kind, in its order
  const proposals = [];
  const propose = (bits, depth = 0) => {
    bits = bits.map(b => peel(b)[0]);
    const ds = bits.map(b => (isConst(b) ? null : cellAt(b)));
    if (bits.length < 2) return;
    if (ds.some(d => !d || d.kind !== ds[0].kind)) { segments(ds).forEach(([i, j]) => propose(bits.slice(i, j), depth + 1)); return; }
    if (new Set(ds.map(d => d.name)).size !== ds.length) return;
    if (ds.every(d => d.kind === 'ff')) {
      if (ds.every(d => ffKey(d.c) === ffKey(ds[0].c))) proposals.push(ds.map(d => d.name));
      return;
    }
    if (depth >= DEPTH || ds.some(d => d.kind !== ds[0].kind)) return;
    const ins = ds[0].lut ? ds[0].lut.ins.map((_, j) => ds.map((d, i) => align(d, ds[0], i)[j])) : ['A', 'B', 'S'].filter(p => ds[0].c.connections[p]).map(p => ds.map(d => d.c.connections[p][0]));
    for (const v of ins) if (!v.every(b => b === v[0])) propose(v, depth + 1);
  };
  for (const p of pieces) { propose(p.map(sOf)); propose(p.map(st => st.di)); }
  // (#659: the flip-flops of one bit whose next values are outputs of one table, a ROM of core/compiled-tables.js,
  // through the cells of their enable and reset: one register per table and kind, in the table's order)
  const romAt = b => { const d = !isConst(b) && driver.get(b); return d && d.c.type === '$mem_v2' && d.port === 'RD_DATA' && !int(d.c.parameters.WR_PORTS) ? d : null; };
  const romOf = (b, q, depth = 0) => {
    const r = romAt(b);
    if (r || b === q || depth > 2) return r;
    const d = cellAt(b);
    if (!d || d.kind === 'ff') return null;
    for (const x of d.lut ? d.lut.ins : ['A', 'B', 'S'].flatMap(p => d.c.connections[p] || [])) { const f = romOf(x, q, depth + 1); if (f) return f; }
    return null;
  };
  const fed = new Map();
  for (const [name, c] of Object.entries(cells)) {
    if (!ff1(c) || !c.connections.D) continue;
    const r = romOf(c.connections.D[0], c.connections.Q[0]);
    if (!r) continue;
    const key = `${r.name} ${ffKey(c)}`;
    if (!fed.has(key)) fed.set(key, new Map());
    if (!fed.get(key).has(r.i)) fed.get(key).set(r.i, name);
  }
  for (const g of fed.values()) if (g.size >= 2) proposals.push([...g].sort((a, b) => a[0] - b[0]).map(([, n]) => n));

  return { proposals };
}
