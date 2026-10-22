// The critical LUTs made one level shallower, their fan-out kept (#652): on a small control path ABC's mapping
// follows the logic as written, and a cut-based mapping only sees the cuts of the graph as it is. spi-fpga-slave's
// shift register enable, `load_data_en | (spi_clk_redge_en & ~cs_n_reg)`, with `load_data_en` (level 2, shared by
// the 8 bits' multiplexers) of `rx_data_vld` (level 1), is 3 levels of LUTs where XST has 2. ABC's speedup finds
// the 2 levels but makes the shared `load_data_en` again in every bit's multiplexer (21 LUTs -> 33). Here, on the
// mapped netlist (Yosys's JSON, LUT1-LUT4, INV and BUF cells), the LUT that drives the end of a critical path, at
// level L, is made again at level L-1 at most, its output (and so its fan-out) kept and every other LUT left as it
// is (the old ones only removed when nothing reads them any more):
//   - its function F over the leaves of its cone below level L-2 (Y), and the candidates for the new LUT's inputs:
//     the signals of the cone of level L-2 at most, the shared ones included (`rx_data_vld`);
//   - F = h(S), S up to 4 of the candidates: one LUT (a cone that converges again); or
//   - F = h(g(A), S): g a new LUT of up to 4 of the leaves of level L-3 at most, S up to 3 candidates (a
//     decomposition of F with a bound set A and a free set S of other signals: for each value of A and of S, F
//     constant, and the values of A in two classes compatible on every S, g's two values);
//   - else a tree of LUT4s over a cut of its cone of up to RESYNTH_RULE.treeLeaves leaves (the latest signals expanded
//     first), by disjoint decompositions F = h(g(A), rest), A of 2 to 4 signals and the earliest first, then the same
//     with h: a cone that converges again (iwls05-sasc's FIFO, where its pointers reach the root through two LUTs of
//     level 2: one g cannot hold them, two can);
// all found by truth tables of up to 2^MAX_LEAVES rows, so the new netlist computes the same functions by
// construction. A round makes every end of the critical path one level shallower (else it is undone and the
// pass ends), until the critical path's ends cannot be (another kind of cell, a function with no such
// decomposition) or RESYNTH_RULE.rounds rounds.
export const RESYNTH_RULE = { rounds: 16, leaves: 8, candidates: 10, treeLeaves: 12 };

const isLut = t => /^(LUT[1-4]|INV|BUF)$/.test(t);
const LEVEL_CELL = t => /^(LUT[1-6]|INV|MUXF5)$/.test(t);
const COMB_CELL = t => /^(LUT[1-6]|INV|BUF|MUXF[5-8]|MUXCY|XORCY)$/.test(t);

const lutInputs = c => (c.type === 'INV' || c.type === 'BUF' ? [c.connections.I[0]] : Array.from({ length: +c.type[3] }, (_, i) => c.connections[`I${i}`][0]));
// a LUT's table: entry i (inputs I0 … as bits 0 …) 0 or 1
function lutTable(c) {
  if (c.type === 'INV') return [1, 0];
  if (c.type === 'BUF') return [0, 1];
  const k = +c.type[3], s = String(c.parameters?.INIT ?? '');
  const bits = /^[01]+$/.test(s) ? s : (Number(s) >>> 0).toString(2);
  return Array.from({ length: 1 << k }, (_, i) => +(bits[bits.length - 1 - i] ?? 0));
}
const initOf = t => Array.from(t, (_, i) => (t[t.length - 1 - i] ? '1' : '0')).join('');

/** The drivers and levels of a module's signals: { driver: Map bit -> cell name, level(bit) } (a LUT, INV or MUXF5 a
 *  level, as logicLevels counts them; a sequential cell's output, an input level 0). */
export function netlistLevels(mod) {
  const cells = mod.cells;
  const driver = new Map();
  for (const [n, c] of Object.entries(cells)) for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'output') for (const b of bits) if (typeof b === 'number') driver.set(b, n);
  const memo = new Map(), busy = new Set();
  const level = b => {
    const c = typeof b === 'number' && cells[driver.get(b)];
    if (!c || !COMB_CELL(c.type)) return 0;
    if (memo.has(b)) return memo.get(b);
    if (busy.has(b)) return 0;   // (a combinational loop)
    busy.add(b);
    let m = 0;
    for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'input') for (const x of bits) m = Math.max(m, level(x));
    busy.delete(b);
    const v = m + (LEVEL_CELL(c.type) ? 1 : 0);
    memo.set(b, v);
    return v;
  };
  return { driver, level };
}

// the leaves of the cone of `root`: a LUT's output expanded while late(bit), at most max leaves (else null)
function cone(cells, driver, root, late, max) {
  const leaves = new Set(), inner = new Set(), seen = new Set();
  const walk = b => {
    if (seen.has(b)) return;
    seen.add(b);
    const c = typeof b === 'number' && cells[driver.get(b)];
    if (c && isLut(c.type) && (b === root || late(b))) { inner.add(b); for (const x of lutInputs(c)) walk(x); }
    else leaves.add(b);
  };
  walk(root);
  return leaves.size <= max ? { leaves: [...leaves], inner: [...inner] } : null;
}

// the truth tables of signals over the leaves (each a Uint8Array of 2^leaves rows)
function tables(cells, driver, leaves, sigs) {
  const N = 1 << leaves.length;
  const out = sigs.map(() => new Uint8Array(N));
  const lut = new Map();
  for (let m = 0; m < N; m++) {
    const val = new Map(leaves.map((l, i) => [l, (m >> i) & 1]));
    const ev = b => {
      if (typeof b !== 'number') return b === '1' ? 1 : 0;
      if (val.has(b)) return val.get(b);
      const n = driver.get(b);
      if (!lut.has(n)) lut.set(n, { ins: lutInputs(cells[n]), t: lutTable(cells[n]) });
      const { ins, t } = lut.get(n);
      let i = 0;
      for (let k = 0; k < ins.length; k++) i |= ev(ins[k]) << k;
      val.set(b, t[i]);
      return t[i];
    };
    sigs.forEach((s, k) => { out[k][m] = ev(s); });
  }
  return out;
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) yield* combinations(arr, k, i + 1, [...acc, arr[i]]);
}

/** F (a table of N rows) as h(g(A), S): A and S tables of the same rows. { g, h } (g over A's values, h over
 *  (g, S…): input 0 g, inputs 1… S; with no A, h over S alone), or null when F is not such a function. */
export function decompose(F, N, A, S) {
  const nA = A.length, nS = S.length, nAv = 1 << nA, nSv = 1 << nS;
  const c = new Int8Array(nAv * nSv).fill(-1);   // F for a value of A and of S: one value, or not a decomposition
  for (let m = 0; m < N; m++) {
    let a = 0, s = 0;
    for (let i = 0; i < nA; i++) a |= A[i][m] << i;
    for (let i = 0; i < nS; i++) s |= S[i][m] << i;
    const k = a * nSv + s;
    if (c[k] === -1) c[k] = F[m];
    else if (c[k] !== F[m]) return null;
  }
  // the values of A in two classes (g = 0, 1): two of them in one class when they agree on every S both reach
  const g = new Int8Array(nAv).fill(-1);
  const clash = (a, b) => { for (let s = 0; s < nSv; s++) { const x = c[a * nSv + s], y = c[b * nSv + s]; if (x !== -1 && y !== -1 && x !== y) return true; } return false; };
  for (let a0 = 0; a0 < nAv; a0++) {
    if (g[a0] !== -1) continue;
    g[a0] = 0;
    for (const q = [a0]; q.length;) {
      const a = q.pop();
      for (let b = 0; b < nAv; b++) if (b !== a && clash(a, b)) {
        if (g[b] === -1) { g[b] = 1 - g[a]; q.push(b); }
        else if (g[b] === g[a]) return null;
      }
    }
  }
  const h = new Uint8Array(nA ? 2 * nSv : nSv);
  for (let a = 0; a < nAv; a++) for (let s = 0; s < nSv; s++) { const x = c[a * nSv + s]; if (x !== -1) h[nA ? (s << 1) | g[a] : s] = x; }
  return { g: Uint8Array.from(g), h };
}

/** A shallower implementation of the LUT that drives `root` (its level L), of level L-1 at most: { root, h: { inputs,
 *  table }, g: { inputs, table } | null }, or { root, tree: [{ inputs, table }] } (the tree's LUTs, the last the root's;
 *  an input { lut: k } the tree's LUT k), or null. */
export function shallower(mod, root, ctx, rule = RESYNTH_RULE) {
  return shallowerLut(mod, root, ctx, rule) || (rule.treeLeaves ? shallowerTree(mod, root, ctx, rule) : null);
}

// F (a table over vars, var i bit i of the row; lv their levels) as a tree of LUT4s of level maxLevel at most, by
// disjoint decompositions F = h(g(A), rest), A of 2-4 vars, g's level the lowest first: { level, luts: [{ inputs: [var |
// { lut: k }], table }] } (the last the root), or null
function treeOf(F, vars, lv, maxLevel) {
  const luts = [];
  for (;;) {
    const n = vars.length;
    const dep = vars.map((_, i) => dependsOn(F, F.length, i));
    if (dep.some(d => !d)) {
      const keep = dep.map((d, i) => (d ? i : -1)).filter(i => i >= 0);
      const G = new Uint8Array(1 << keep.length);
      for (let m = 0; m < G.length; m++) { let x = 0; keep.forEach((v, j) => { x |= ((m >> j) & 1) << v; }); G[m] = F[x]; }
      F = G; vars = keep.map(i => vars[i]); lv = keep.map(i => lv[i]);
      continue;
    }
    if (!n) return null;
    if (n <= 4) {
      const level = Math.max(...lv) + 1;
      if (level > maxLevel) return null;
      luts.push({ inputs: vars, table: Array.from(F) });
      return { level, luts };
    }
    // the bound sets A, g's level the lowest first (then the larger A): the first whose values give F two columns
    const sets = [];
    for (let k = 4; k >= 2; k--) for (const A of combinations([...Array(n).keys()], k)) {
      const lA = Math.max(...A.map(i => lv[i])) + 1;
      if (lA < maxLevel) sets.push({ A, lA });
    }
    sets.sort((x, y) => x.lA - y.lA || y.A.length - x.A.length);
    let best = null;
    for (const { A, lA } of sets) {
      const k = A.length, rest = [...Array(n).keys()].filter(i => !A.includes(i)), nr = 1 << rest.length;
      const cols = [], g = new Uint8Array(1 << k);
      const col = new Uint8Array(nr);
      let ok = true;
      for (let a = 0; a < 1 << k && ok; a++) {
        let base = 0;
        for (let j = 0; j < k; j++) base |= ((a >> j) & 1) << A[j];
        for (let r = 0; r < nr; r++) { let m = base; for (let j = 0; j < rest.length; j++) m |= ((r >> j) & 1) << rest[j]; col[r] = F[m]; }
        let c = cols.findIndex(x => x.every((v, r) => v === col[r]));
        if (c < 0) { if (cols.length === 2) ok = false; else { c = cols.length; cols.push(col.slice()); } }
        g[a] = c;
      }
      if (ok && cols.length === 2) { best = { A, rest, lA, g, cols }; break; }
    }
    if (!best) return null;
    luts.push({ inputs: best.A.map(i => vars[i]), table: Array.from(best.g) });
    const H = new Uint8Array(1 << (best.rest.length + 1));
    for (let m = 0; m < H.length; m++) H[m] = best.cols[m >> best.rest.length][m & ((1 << best.rest.length) - 1)];
    F = H; vars = [...best.rest.map(i => vars[i]), { lut: luts.length - 1 }]; lv = [...best.rest.map(i => lv[i]), best.lA];
  }
}
// the LUT at level L made a tree of level L-1 at most over a cut of its cone (the latest signals expanded first, up to
// rule.treeLeaves leaves), by treeOf: { root, tree: luts } or null
function shallowerTree(mod, root, { driver, level }, rule) {
  const cells = mod.cells;
  const L = level(root), c = cells[driver.get(root)];
  if (L < 2 || !c || !isLut(c.type)) return null;
  let leaves = [...new Set(lutInputs(c))];
  for (let step = 0; step < 64; step++) {
    if (leaves.every(b => level(b) <= L - 2)) {
      const [F] = tables(cells, driver, leaves, [root]);
      const t = treeOf(F, leaves, leaves.map(b => level(b)), L - 1);
      if (t) return { root, tree: t.luts };
    }
    // expand the latest LUT leaf
    const lut = leaves.filter(b => typeof b === 'number' && isLut(cells[driver.get(b)]?.type ?? '')).sort((a, b) => level(b) - level(a))[0];
    if (lut === undefined) return null;
    const next = [...new Set([...leaves.filter(b => b !== lut), ...lutInputs(cells[driver.get(lut)])])];
    if (next.length > rule.treeLeaves) return null;
    leaves = next;
  }
  return null;
}

function shallowerLut(mod, root, { driver, level }, rule) {
  const cells = mod.cells;
  const L = level(root);
  const c = cells[driver.get(root)];
  if (L < 2 || !c || !isLut(c.type)) return null;
  // X: what h may read (level L-2 at most), the root's cone cut there
  const X = cone(cells, driver, root, b => level(b) >= L - 1, rule.leaves);
  if (!X || X.leaves.some(b => level(b) > L - 2)) return null;
  const tbl = xs => xs.map(x => x.t);
  // h alone: F a function of up to 4 of X
  {
    const N = 1 << X.leaves.length;
    const [F, ...T] = tables(cells, driver, X.leaves, [root, ...X.leaves]);
    const S = X.leaves.map((b, i) => ({ b, t: T[i] })).filter((_, i) => dependsOn(F, N, i));
    if (S.length <= 4) {
      const r = decompose(F, N, [], tbl(S));
      if (r) return { root, h: { inputs: S.map(x => x.b), table: r.h }, g: null };
    }
  }
  // h(g(A), S): F over a cut Z of the cone, X with some of its signals of level L-2 made their LUTs' inputs (level
  // L-3 at most, what g may read), the smallest cuts first; S of X, A of Z's leaves of level L-3 at most
  const mids = X.leaves.filter(b => level(b) === L - 2 && isLut(cells[driver.get(b)]?.type ?? ''));
  const cuts = [];
  for (let k = 0; k <= Math.min(mids.length, 4); k++) for (const e of combinations(mids, k)) {
    const z = [...new Set([...X.leaves.filter(b => !e.includes(b)), ...e.flatMap(b => lutInputs(cells[driver.get(b)]))])];
    if (z.length <= rule.leaves && z.some(b => level(b) <= L - 3)) cuts.push(z);
  }
  for (const Z of cuts.sort((a, b) => a.length - b.length)) {
    const N = 1 << Z.length;
    const [F, ...T] = tables(cells, driver, Z, [root, ...X.leaves, ...Z]);
    const S = X.leaves.map((b, i) => ({ b, t: T[i] })).filter(x => Z.some((_, i) => dependsOn(x.t, N, i))).slice(0, rule.candidates);
    const A = Z.map((b, i) => ({ b, t: T[X.leaves.length + i] })).filter((x, i) => level(x.b) <= L - 3 && dependsOn(F, N, i));
    for (let k = 0; k <= 3; k++) for (const s of combinations(S, k)) for (let j = 2; j <= 4; j++) for (const a of combinations(A, j)) {
      const r = decompose(F, N, tbl(a), tbl(s));
      if (r) return { root, h: { inputs: [null, ...s.map(x => x.b)], table: r.h }, g: { inputs: a.map(x => x.b), table: r.g } };
    }
  }
  return null;
}
// does a table of N rows depend on its variable i?
function dependsOn(t, N, i) {
  for (let m = 0; m < N; m++) if (!((m >> i) & 1) && t[m] !== t[m | (1 << i)]) return true;
  return false;
}

const lutCell = (inputs, table, out, attributes = {}) => ({
  hide_name: 1, type: `LUT${inputs.length}`, parameters: { INIT: initOf(table) }, attributes,
  port_directions: { ...Object.fromEntries(inputs.map((_, i) => [`I${i}`, 'input'])), O: 'output' },
  connections: { ...Object.fromEntries(inputs.map((b, i) => [`I${i}`, [b]])), O: [out] },
});

// a LUT's function as a key: its inputs in order (their bits) and its table permuted to that order
function lutKey(inputs, table) {
  const order = inputs.map((b, i) => [String(b), i]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const t = Array.from({ length: table.length }, (_, m) => {
    let i = 0;
    order.forEach(([, j], k) => { i |= ((m >> k) & 1) << j; });
    return table[i] ? 1 : 0;
  });
  return `${order.map(([b]) => b).join(',')}:${t.join('')}`;
}

// a change made: the root's LUT h (its name, its output), g a new LUT and its net. Either may already be in the netlist
// (the same function of the same signals: the critical ends of a round often need the same one): then that LUT is read
// instead (vtr-ch-intrinsics: 13 inverters of one LUT's output, Yosys's extractinv's, each collapsed into the same LUT4;
// one LUT each would load its inputs 14 times), the root's readers moved to it when it is h's (not a port's bit)
function applyChange(mod, ch, driver, fresh) {
  const name = driver.get(ch.root);
  const luts = Object.values(mod.cells).filter(c => isLut(c.type));
  const existing = (ins, t) => { const key = lutKey(ins, t); return luts.find(c => lutKey(lutInputs(c), lutTable(c)) === key)?.connections.O[0]; };
  if (ch.tree) {
    // the tree's LUTs but the last made (or found), the last the root's h
    const outs = [];
    const bit = v => (typeof v === 'object' && v !== null && 'lut' in v ? outs[v.lut] : v);
    for (const l of ch.tree.slice(0, -1)) {
      const ins = l.inputs.map(bit);
      const same = existing(ins, l.table);
      if (same !== undefined) { outs.push(same); continue; }
      const b = fresh();
      mod.cells[`$silinx$resynth$lut${b}`] = lutCell(ins, l.table, b);
      mod.netnames[`$silinx$resynth$net${b}`] = { hide_name: 1, bits: [b], attributes: {} };
      luts.push(mod.cells[`$silinx$resynth$lut${b}`]);
      outs.push(b);
    }
    const last = ch.tree[ch.tree.length - 1];
    ch = { root: ch.root, h: { inputs: last.inputs.map(bit), table: last.table }, g: null };
  }
  const inputs = [...ch.h.inputs];
  if (ch.g) {
    const same = existing(ch.g.inputs, ch.g.table);
    if (same !== undefined) inputs[0] = same;
    else {
      const bit = fresh();
      mod.cells[`$silinx$resynth$lut${bit}`] = lutCell(ch.g.inputs, ch.g.table, bit);
      mod.netnames[`$silinx$resynth$net${bit}`] = { hide_name: 1, bits: [bit], attributes: {} };
      inputs[0] = bit;
    }
  }
  const same = existing(inputs, ch.h.table);
  const port = Object.values(mod.ports || {}).some(p => p.bits.includes(ch.root));
  if (same !== undefined && same !== ch.root && !port) {
    delete mod.cells[name];
    for (const c of Object.values(mod.cells)) for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'input') c.connections[p] = bits.map(b => (b === ch.root ? same : b));
    for (const w of Object.values(mod.netnames)) w.bits = w.bits.map(b => (b === ch.root ? same : b));
    return same;
  }
  mod.cells[name] = lutCell(inputs, ch.h.table, ch.root, mod.cells[name].attributes);
  return ch.root;
}

// the LUTs whose outputs nothing reads, removed
function sweep(mod) {
  for (;;) {
    const read = new Set();
    for (const c of Object.values(mod.cells)) for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'input') for (const b of bits) read.add(b);
    for (const w of Object.values(mod.ports || {})) for (const b of w.bits) read.add(b);
    const dead = Object.entries(mod.cells).filter(([, c]) => isLut(c.type) && !read.has(c.connections.O[0]));
    if (!dead.length) return;
    for (const [n] of dead) delete mod.cells[n];
  }
}

/** The critical path's LUTs made shallower (see above) in a Yosys JSON netlist (its top module); `ends(netlist)`:
 *  the ends of its critical paths, [{ cell, port }] (pathEnds' within the worst). { json (the new netlist, an
 *  object), rounds, luts (the LUTs made again) } or null when nothing changed. */
export function resynthCritical(json, top, ends, rule = RESYNTH_RULE) {
  let nl = JSON.parse(typeof json === 'string' ? json : JSON.stringify(json));
  const modOf = x => x.modules[top] || Object.values(x.modules).find(m => m.attributes?.top) || Object.values(x.modules)[0];
  let maxBit = 0;
  for (const w of Object.values(modOf(nl).netnames || {})) for (const b of w.bits) if (typeof b === 'number') maxBit = Math.max(maxBit, b);
  for (const c of Object.values(modOf(nl).cells)) for (const bits of Object.values(c.connections)) for (const b of bits) if (typeof b === 'number') maxBit = Math.max(maxBit, b);
  const fresh = () => ++maxBit;
  let rounds = 0, luts = 0;
  for (; rounds < rule.rounds; rounds++) {
    const next = JSON.parse(JSON.stringify(nl));
    const mod = modOf(next);
    const roots = [...new Set(ends(next).map(e => mod.cells[e.cell]?.connections[e.port]?.[0]))];
    let made = 0, ok = roots.length > 0;
    for (const root of roots) {
      const ctx = netlistLevels(mod);
      const ch = typeof root === 'number' ? shallower(mod, root, ctx, rule) : null;
      if (!ch) { ok = false; break; }
      applyChange(mod, ch, ctx.driver, fresh);
      made++;
    }
    if (!ok) break;
    sweep(mod);
    nl = next;
    luts += made;
  }
  return luts ? { json: nl, rounds, luts } : null;
}
