// Silinx - a gate-level model at word level again: its cells of one bit (#405: out of wordLevel in
// core/compiled-words.js): each bit's driver and readers, a LUT's canonical table, the gates and flip-flops of one
// bit and their kinds, and the carry chains (their stages, XORs and order).
import { FFS, FF_DATA, FF_VALUES, GATES, MIN_CHAIN, int, isConst, permutations } from './compiled-words.js';

/** { cellAt, chains, driver, ff1, ffKey, readers } of wordLevel. */
export function mountBitCells(ctx) {
  const {
    cells, mod
  } = ctx;

  // ---- the cells of one bit: drivers and readers
  const driver = new Map();   // bit -> { name, c, port, i }
  const readers = new Map();  // bit -> number of reading ports (and output ports)
  const read = b => { if (!isConst(b)) readers.set(b, (readers.get(b) || 0) + 1); };
  for (const [name, c] of Object.entries(cells)) {
    for (const [port, bits] of Object.entries(c.connections)) {
      const out = c.port_directions?.[port] === 'output' || (!c.port_directions && (port === 'Y' || port === 'Q'));
      bits.forEach((b, i) => { if (out) { if (!isConst(b)) driver.set(b, { name, c, port, i }); } else read(b); });
    }
  }
  for (const p of Object.values(mod.ports || {})) if (p.direction !== 'input') p.bits.forEach(read);
  // a LUT ($shiftx of a constant, one bit): its inputs (constant ones folded, those it does not read dropped) and its
  // table in a canonical order of them (the router swaps a LUT's pins: the same function, another INIT); alts: the
  // orders of its inputs that give that table (a symmetric function: several)
  const canon = new Map();
  const lutOf = c => {
    if (c.type !== '$shiftx' || c.connections.Y.length !== 1 || int(c.parameters?.B_SIGNED ?? 0)) return null;
    const A = c.connections.A, B = c.connections.B;
    if (!A.every(isConst) || B.length > 6) return null;
    let table = Array.from({ length: 1 << B.length }, (_, m) => (A[m] === '1' ? 1 : 0)), ins = B.slice();
    for (let j = ins.length - 1; j >= 0; j--) {
      const lo = table.filter((_, m) => !((m >> j) & 1)), hi = table.filter((_, m) => (m >> j) & 1);
      if (isConst(ins[j])) table = ins[j] === '1' ? hi : lo;
      else if (lo.join('') === hi.join('')) table = lo;
      else continue;
      ins.splice(j, 1);
    }
    const key = `${ins.length} ${table.join('')}`;
    if (!canon.has(key)) {
      let best = null, perms = [];
      for (const pi of permutations(ins.length)) {
        const t = Array.from({ length: table.length }, (_, x) => table[pi.reduce((y, from, q) => y | (((x >> q) & 1) << from), 0)]).join('');
        if (best === null || t < best) { best = t; perms = [pi]; } else if (t === best) perms.push(pi);
      }
      canon.set(key, { table: best.split('').map(Number), perms });
    }
    const { table: t, perms } = canon.get(key);
    const alts = perms.map(pi => pi.map(from => ins[from]));
    return { table: t, ins: alts[0], alts };
  };
  const gate = c => GATES.has(c.type) && c.connections.Y.length === 1;
  const ff1 = c => FFS.has(c.type) && c.connections.Q.length === 1;
  // a cell of one bit driving b (a gate, a LUT, a flip-flop), with its kind
  const cellAt = b => {
    const d = isConst(b) ? null : driver.get(b);
    if (!d) return null;
    if (gate(d.c)) return { ...d, kind: d.c.type };
    const l = lutOf(d.c);
    if (l) return { ...d, kind: `$lut ${l.table.join('')}`, lut: l };
    if (ff1(d.c) && d.port === 'Q') return { ...d, kind: 'ff' };
    return null;
  };
  // a flip-flop's kind: its type, parameters and controls (its data and values per bit apart)
  const ffKey = c => JSON.stringify([c.type, Object.entries(c.parameters || {}).filter(([k]) => k !== 'WIDTH' && !FF_VALUES.includes(k)),
    Object.entries(c.connections).filter(([k]) => k !== 'Q' && !FF_DATA.includes(k))]);

  // ---- the carry chains: stages c' = S ? c : DI ($mux, B = c), c & S ($and: DI 0), c | ~S ($or: DI 1, S its other input
  // inverted); a stage's output read by the next as its carry, its XOR (o = c ^ S) when there is one
  const stageOf = (name, c, carry) => {
    const C = c.connections;
    if (c.type === '$mux') return C.B[0] === carry ? { name, carry, s: C.S[0], inv: false, di: C.A[0], out: C.Y[0] } : null;
    if (c.type !== '$and' && c.type !== '$or') return null;
    const other = C.A[0] === carry ? C.B[0] : C.B[0] === carry ? C.A[0] : null;
    if (other == null) return null;
    return { name, carry, s: other, inv: c.type === '$or', di: c.type === '$or' ? '1' : '0', out: C.Y[0] };
  };
  // the XOR of a stage: o = c ^ S (S inverted: the output of a $not of its bit)
  const xorsOf = new Map();   // bit -> [$xor names reading it]
  for (const [name, c] of Object.entries(cells)) {
    if (c.type !== '$xor' || c.connections.Y.length !== 1) continue;
    for (const b of [c.connections.A[0], c.connections.B[0]]) if (!isConst(b)) { if (!xorsOf.has(b)) xorsOf.set(b, []); xorsOf.get(b).push(name); }
  }
  const xorOf = (st) => {
    for (const x of xorsOf.get(st.carry) || []) {
      const C = cells[x].connections, other = C.A[0] === st.carry ? C.B[0] : C.A[0];
      if (!st.inv && other === st.s) return x;
      // (c | t, its XOR c ^ ~t: ~t a $not of t)
      const d = st.inv && driver.get(other);
      if (d && d.c.type === '$not' && d.c.connections.A[0] === st.s) return x;
    }
    return null;
  };
  // the stages reading a bit as their carry
  const stagesOf = new Map();
  for (const [name, c] of Object.entries(cells)) {
    if (!gate(c) || !['$mux', '$and', '$or'].includes(c.type)) continue;
    const C = c.connections;
    for (const carry of c.type === '$mux' ? [C.B[0]] : [C.A[0], C.B[0]]) {
      const st = !isConst(carry) && stageOf(name, c, carry);
      if (!st) continue;
      if (!stagesOf.has(carry)) stagesOf.set(carry, []);
      stagesOf.get(carry).push(st);
    }
  }
  // (of the stages reading a carry, the one with its XOR; else the only one)
  const nextOf = (out) => {
    const sts = stagesOf.get(out) || [];
    const withXor = sts.filter(st => xorOf(st));
    return withXor.length === 1 ? withXor[0] : sts.length === 1 ? sts[0] : null;
  };
  // (a chain starts at a stage no stage's output is the carry of; of a cell's two, the one with its XOR)
  const all = [...stagesOf.values()].flat(), hasPrev = new Set();
  for (const st of all) { const n = nextOf(st.out); if (n) hasPrev.add(n.name); }
  const chains = [], inChain = new Set();
  for (const st0 of all.filter(st => !hasPrev.has(st.name)).sort((a, b) => (xorOf(b) ? 1 : 0) - (xorOf(a) ? 1 : 0))) {
    if (inChain.has(st0.name)) continue;
    const chain = [];
    for (let st = st0; st && !inChain.has(st.name); st = nextOf(st.out)) { chain.push({ ...st, xor: xorOf(st) }); inChain.add(st.name); }
    if (chain.length >= MIN_CHAIN) chains.push(chain);
    else chain.forEach(st => inChain.delete(st.name));
  }

  return { cellAt, chains, driver, ff1, ffKey, readers };
}
