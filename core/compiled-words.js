// Silinx - a gate-level netlist at word level again, for the compiled cycle simulator (#650): a synthesized
// netlist (the Post-Synthesis Simulation Model, the post-translate, post-map and post-place & route models) is
// a design's logic bit by bit, each bit of a counter a flip-flop, a carry multiplexer, an XOR and the
// multiplexers of its reset and enable. Run as such, it is several times slower than the behavioural design
// (#629). Here the netlist Yosys read (prep -flatten, its primitives' models flattened into $mux, $and, $xor,
// $shiftx (a LUT), $dff, $aldff... of one bit) is made word level where that computes the same values with
// fewer operations:
//   - a carry chain (MUXCY: c' = S ? c : DI, as $mux, or $and / $or once its constants are folded; XORCY:
//     o = c ^ S, $xor) of k stages is an addition: A = S | DI, B = ~S & DI, sum = A + B + c0, its bits the
//     XORs' outputs, its top bit the carry out, the carries in between sum ^ S;
//   - the flip-flops whose outputs are a chain's S or DI (a counter's, a comparator's operands), of the same
//     kind, clock and controls, are one register, in the chain's order;
//   - the one-bit cells of the same kind side by side between them (the multiplexers of a reset and an enable,
//     the gates, the LUTs of the same INIT: their inputs the same scalar or bits of words) are one cell of k bits,
//     a LUT a few bitwise operations (its scalar inputs as ?:).
// Each word is kept only when its inputs come in a few pieces (a run of a word's bits, a constant, a bit
// repeated), as compileNetlist puts them together: a register whose next value is not such a word stays bits.
// The values are the netlist's, cycle for cycle; every bit keeps its number (the nets, the Watch box).
//
//   const { json, stats } = wordLevel(json, top)   // a copy; stats: { chains, registers, cells: [before, after] }
//
// Isomorphic ES module (browser + Node), no DOM.

const GATES = new Set(['$and', '$or', '$xor', '$not', '$mux']);
const FFS = new Set(['$dff', '$dffe', '$aldff', '$aldffe', '$adff', '$adffe', '$sdff', '$sdffe', '$sdffce']);
const FF_DATA = ['D', 'AD'];                       // a flip-flop's ports of one bit each
const FF_VALUES = ['ARST_VALUE', 'SRST_VALUE'];    // its parameters of one bit each
const MAXW = 31;     // the bits of a word at most (a number, its carry out the 32nd)
const MIN_CHAIN = 3; // the stages of a carry chain made an addition, at least
const DEPTH = 12;    // the cells a word is looked for through, at most

function permutations(n) {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap(p => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}
const isConst = b => typeof b !== 'number';
const pbits = s => (typeof s === 'number' ? s.toString(2) : String(s)).split('').reverse().map(c => (c === '1' ? 1 : 0));
const int = s => (typeof s === 'number' ? s : parseInt(String(s).replace(/[xz]/gi, '0'), 2));

/** The netlist (Yosys's JSON) with its gate-level logic at word level: { json: a copy, stats }. */
export function wordLevel(json, top) {
  json = structuredClone(json);
  const mod = json.modules[top];
  if (!mod) return { json, stats: { chains: 0, registers: 0, cells: [0, 0] } };
  const cells = mod.cells || {};
  const before = Object.keys(cells).length;
  let fresh = 1 + Math.max(0, ...Object.values(cells).flatMap(c => Object.values(c.connections).flat().filter(b => !isConst(b))),
    ...Object.values(mod.ports || {}).flatMap(p => p.bits.filter(b => !isConst(b))), ...Object.values(mod.netnames || {}).flatMap(n => n.bits.filter(b => !isConst(b))));
  const newBits = k => Array.from({ length: k }, () => fresh++);

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

  // ---- the plan: words and where each bit is (a word's name and the bit's position), undone on a failure
  let where, planned, actions, log;
  const reset = () => { where = new Map(); planned = new Set(); actions = []; log = []; };
  const place = (bit, w, off) => { log.push(['w', bit, where.get(bit)]); where.set(bit, [w, off]); };
  const take = name => { log.push(['p', name]); planned.add(name); };
  const mark = () => [log.length, actions.length];
  const undo = ([l, a]) => {
    while (log.length > l) {
      const [k, x, prev] = log.pop();
      if (k === 'w') { if (prev) where.set(x, prev); else where.delete(x); } else planned.delete(x);
    }
    actions.length = a;
  };
  // (an input port's bits: the port's word)
  const portAt = new Map();
  for (const [name, p] of Object.entries(mod.ports || {})) if (p.direction === 'input') p.bits.forEach((b, i) => { if (!isConst(b)) portAt.set(b, [`port ${name}`, i]); });
  const at = b => where.get(b) || (driver.has(b) ? [driver.get(b).name, driver.get(b).i] : portAt.get(b) || [`in${b}`, 0]);
  // the pieces compileNetlist puts a list of bits together from (sig: runs of a word's bits, a bit repeated)
  const runs = bits => {
    let n = 0, last = null, rep = false, len = 0;
    for (const b of bits) {
      if (isConst(b)) { last = null; continue; }
      const [w, off] = at(b);
      if (last && last[0] === w && !rep && last[1] + len === off) { len++; continue; }
      if (last && last[0] === w && last[1] === off && (rep || len === 1)) { rep = true; len++; continue; }
      n++; last = [w, off]; len = 1; rep = false;
    }
    return n;
  };
  const cheap = bits => runs(bits) <= Math.max(1, Math.floor(bits.length / 3));

  // (a LUT's inputs in the order, of those giving its table, that reads the words of the first one's inputs, at the
  // positions after them: i bits further)
  const align = (d, ref, i) => {
    if (d.lut.alts.length === 1 || d === ref) return d.lut.ins;
    const score = ins => ins.reduce((n, b, j) => { const r = ref.lut.ins[j]; if (isConst(b) || isConst(r)) return n; const [w, o] = at(b), [rw, ro] = at(r); return n + (w === rw ? (o === ro + i ? 2 : 1) : 0); }, 0);
    return d.lut.alts.reduce((best, ins) => (score(ins) > score(best) ? ins : best));
  };
  // the runs of cells of one kind (two at least) in a list of cells: [[start, end]]
  const segments = ds => {
    const out = [];
    for (let i = 0, j; i < ds.length; i = j) {
      for (j = i + 1; j < ds.length && ds[i] && ds[j] && ds[j].kind === ds[i].kind; j++);
      if (ds[i] && j - i >= 2 && j - i < ds.length) out.push([i, j]);
    }
    return out;
  };
  // a bit through inverters and buffers ($not, a LUT of one input or none): [the bit, inverted] (the registers proposed
  // through them)
  const peel = (b) => {
    let inv = 0;
    for (let d; !isConst(b) && (d = cellAt(b));) {
      if (d.kind === '$not') { b = d.c.connections.A[0]; inv ^= 1; } else if (d.lut?.ins.length === 1) { inv ^= d.lut.table[0]; b = d.lut.ins[0]; } else if (d.lut?.ins.length === 0) { b = String(d.lut.table[0]); } else break;
    }
    return isConst(b) ? [b === '1' || b === 1 ? (inv ? '0' : '1') : (inv ? '1' : '0'), 0] : [b, inv];
  };
  // a list of bits as a word: the bits to read in their place (null: none), already a word (cheap); the outputs of
  // cells of one kind side by side, made one cell whose inputs are words in turn
  function vec(bits, depth = 0) {
    if (cheap(bits)) return bits;
    if (depth > DEPTH || bits.length < 2) return null;
    const m = mark();
    const ds = bits.map(cellAt);
    // (cells of several kinds: each run of one kind a word, the whole in a few pieces)
    if (ds.some(d => !d || d.kind !== ds[0].kind)) {
      const out = bits.slice();
      segments(ds).forEach(([i, j]) => { const r = vec(bits.slice(i, j), depth + 1); if (r) out.splice(i, j - i, ...r); });
      if (cheap(out)) return out;
      undo(m);
      return null;
    }
    if (ds[0].kind === 'ff' || ds.some(d => planned.has(d.name)) || new Set(ds.map(d => d.name)).size !== ds.length) return null;
    ds.forEach(d => take(d.name));
    const action = (() => {
      const port = p => ds.map(d => d.c.connections[p][0]);
      const k = ds[0].c.type, cellsOf = ds.map(d => d.name);
      if (ds[0].lut) {
        const n = ds[0].lut.ins.length, pos = Array.from({ length: n }, (_, j) => ds.map((d, i) => align(d, ds[0], i)[j]));
        if (pos.filter(p => !p.every(b => b === p[0])).length > 4) return null;
        for (let j = 0; j < n; j++) if (!pos[j].every(b => b === pos[j][0]) && !(pos[j] = vec(pos[j], depth + 1))) return null;
        return { kind: 'lut', bits, table: ds[0].lut.table, pos, cells: cellsOf };
      }
      if (k === '$not') {
        const A = vec(port('A'), depth + 1);
        return A && { kind: 'cell', type: '$not', bits, conn: { A }, cells: cellsOf };
      }
      if (k === '$mux') {
        let S = port('S');
        const scalar = S.every(b => b === S[0]);
        if (!scalar && !(S = vec(S, depth + 1))) return null;
        const A = vec(port('A'), depth + 1), B = A && vec(port('B'), depth + 1);
        return B && { kind: 'cell', type: scalar ? '$mux' : '$bwmux', bits, conn: { A, B, S: scalar ? [S[0]] : S }, cells: cellsOf };
      }
      // $and, $or, $xor: each cell's inputs in the order of the first's words
      let A = port('A'), B = port('B');
      const w0 = at(A[0])[0];
      for (let i = 1; i < A.length; i++) if (!isConst(B[i]) && at(B[i])[0] === w0 && (isConst(A[i]) || at(A[i])[0] !== w0)) [A[i], B[i]] = [B[i], A[i]];
      A = vec(A, depth + 1); B = A && vec(B, depth + 1);
      return B && { kind: 'cell', type: k, bits, conn: { A, B }, cells: cellsOf };
    })();
    if (!action) { undo(m); return null; }
    action.id = `$words$${actions.length + 1}`;
    actions.push(action);
    bits.forEach((b, i) => place(b, action.id, i));
    return bits;
  }

  // a chain's pieces of MAXW stages at most: an addition each, when its S and DI are words
  const pieces = chains.flatMap(ch => Array.from({ length: Math.ceil(ch.length / MAXW) }, (_, j) => ch.slice(j * MAXW, (j + 1) * MAXW)))
    .filter(p => p.length >= MIN_CHAIN);
  const sOf = st => st.s;   // (the bit the stage reads; inverted, ~ applied to the word)
  function planChain(p) {
    const m = mark();
    if (p.some(st => planned.has(st.name) || (st.xor && planned.has(st.xor)))) return false;
    p.forEach(st => { take(st.name); if (st.xor) take(st.xor); });
    const S = vec(p.map(sOf)), DI = S && vec(p.map(st => st.di));
    if (!DI) { undo(m); return false; }
    const id = `$words$${actions.length + 1}`;
    actions.push({ kind: 'chain', id, p, S, DI });
    p.forEach((st, i) => { if (st.xor) place(cells[st.xor].connections.Y[0], `${id}s`, i); if (i < p.length - 1) place(st.out, `${id}c`, i + 1); });
    place(p.at(-1).out, `${id}s`, p.length);
    return true;
  }

  reset();
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
  const used = new Set();
  let groups = proposals.filter(g => { if (g.some(n => used.has(n))) return false; g.forEach(n => used.add(n)); return true; })
    .flatMap(g => Array.from({ length: Math.ceil(g.length / MAXW) }, (_, j) => g.slice(j * MAXW, (j + 1) * MAXW))).filter(g => g.length >= 2);

  let data;
  // rounds: the registers, the chains, then each register's next value as a word; a register whose next value is
  // no word stays bits, and the round is done again without it
  for (;;) {
    reset();
    groups.forEach((g, j) => g.forEach((n, i) => place(cells[n].connections.Q[0], `$words$r${j}`, i)));
    pieces.forEach(planChain);
    data = new Map();   // register -> { port: the bits it reads }
    const failed = groups.filter(g => {
      const m = mark(), d = {};
      for (const port of FF_DATA) {
        if (!cells[g[0]].connections[port]) continue;
        if (!(d[port] = vec(g.map(n => cells[n].connections[port][0])))) { undo(m); return true; }
      }
      data.set(g, d);
      return false;
    });
    if (!failed.length) break;
    groups = groups.filter(g => !failed.includes(g));
  }

  // ---- the new cells
  const add = (type, conn, params = {}) => {
    const name = `$words$${Object.keys(cells).length}$${fresh}`;
    const w = (conn.Y || conn.Q).length;
    cells[name] = { hide_name: 1, type, parameters: { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: conn.A?.length ?? 0, B_WIDTH: conn.B?.length ?? 0, Y_WIDTH: w, WIDTH: w, ...params }, attributes: {}, connections: conn };
    return conn.Y;
  };
  const drop = names => names.forEach(n => delete cells[n]);
  const allConst = (bits, v) => bits.every(b => b === v);
  for (const [j, g] of groups.entries()) {
    const c0 = cells[g[0]], conn = {};
    for (const [port, bits] of Object.entries(c0.connections)) conn[port] = port === 'Q' ? g.map(n => cells[n].connections.Q[0]) : data.get(g)[port] || bits;
    const params = { ...c0.parameters, WIDTH: g.length };
    for (const p of FF_VALUES) if (p in params) params[p] = g.map(n => pbits(cells[n].parameters[p])[0]).reverse().join('');
    drop(g);
    cells[`$words$r${j}`] = { hide_name: 1, type: c0.type, parameters: params, attributes: {}, port_directions: c0.port_directions, connections: conn };
  }
  let nChains = 0;
  for (const a of actions) {
    if (a.kind === 'cell') {
      drop(a.cells);
      add(a.type, { ...a.conn, Y: a.bits });
    } else if (a.kind === 'lut') {
      drop(a.cells);
      lutCells(a);
    } else {
      nChains++;
      const p = a.p, k = p.length;
      const S0 = a.S, DI = a.DI, inv = p.map(st => (st.inv ? '1' : '0'));
      const S = inv.includes('1') ? add('$xor', { A: S0, B: inv, Y: newBits(k) }) : S0;
      let A, B;
      if (allConst(DI, '0')) { A = S; B = null; } else if (allConst(DI, '1')) { A = Array(k).fill('1'); B = add('$not', { A: S, Y: newBits(k) }); } else {
        A = add('$or', { A: S, B: DI, Y: newBits(k) });
        B = add('$and', { A: add('$not', { A: S, Y: newBits(k) }), B: DI, Y: newBits(k) });
      }
      const c0 = p[0].carry;
      const out = [...p.map(st => (st.xor ? cells[st.xor].connections.Y[0] : fresh++)), p.at(-1).out];
      let sum;
      if (B && c0 !== '0') sum = add('$add', { A: add('$add', { A, B, Y: newBits(k + 1) }), B: [c0], Y: out });
      else sum = add('$add', { A, B: B || [c0], Y: out });
      drop(p.flatMap(st => [st.name, ...(st.xor ? [st.xor] : [])]));
      // (the carries between, when something else reads them: sum ^ S)
      const carries = p.slice(0, -1).map(st => st.out);
      const inner = (st, i) => 1 + (p[i + 1].xor ? 1 : 0);
      if (carries.some((b, i) => (readers.get(b) || 0) > inner(p[i], i))) add('$xor', { A: sum.slice(0, k), B: S, Y: [fresh++, ...carries] });
    }
  }

  // a LUT of k bits: Shannon's expansion on its inputs, the scalar ones as multiplexers (outermost), the words as
  // bitwise operations
  function lutCells(a) {
    const k = a.bits.length;
    const n = a.pos.length;
    const kindOf = p => (p.every(b => b === p[0]) ? (isConst(p[0]) ? 'c' : 's') : 'v');
    // the inputs in order: the words first (innermost), then the scalars; the constants cofactored out
    let table = a.table.slice(), idx = Array.from({ length: n }, (_, j) => j);
    for (let j = n - 1; j >= 0; j--) {
      if (kindOf(a.pos[j]) !== 'c') continue;
      const v = a.pos[j][0] === '1' ? 1 : 0, t = [];
      for (let mi = 0; mi < table.length; mi++) if (((mi >> idx.indexOf(j)) & 1) === v) t.push(table[mi]);
      table = t; idx = idx.filter(x => x !== j);
    }
    const order = [...idx.filter(j => kindOf(a.pos[j]) === 'v'), ...idx.filter(j => kindOf(a.pos[j]) === 's')];
    // (the table re-indexed in that order)
    const t2 = Array.from({ length: table.length }, (_, m) => {
      let mi = 0;
      order.forEach((j, q) => { if ((m >> q) & 1) mi |= 1 << idx.indexOf(j); });
      return table[mi];
    });
    const memo = new Map(), inverse = new Map();   // (a node -> the node it inverts)
    const ones = Array(k).fill('1'), zeros = Array(k).fill('0');
    const node = (t, q) => {
      if (t.every(x => x === t[0])) return t[0] ? 'one' : 'zero';
      const key = `${q} ${t.join('')}`;
      if (memo.has(key)) return memo.get(key);
      const h = t.length >> 1, f0 = node(t.slice(0, h), q - 1), f1 = node(t.slice(h), q - 1);
      const x = a.pos[order[q - 1]], bitsOf = f => (f === 'one' ? ones : f === 'zero' ? zeros : f);
      let r;
      if (f0 === f1) r = f0;
      else if (kindOf(x) === 's') r = add('$mux', { A: bitsOf(f0), B: bitsOf(f1), S: [x[0]], Y: newBits(k) });
      // (x ? ~f : f, x ? f : ~f: f ^ x)
      else if (inverse.get(f0) === f1 || inverse.get(f1) === f0) r = add('$xor', { A: f0, B: x, Y: newBits(k) });
      else if (f0 === 'zero' && f1 === 'one') r = x;
      else if (f0 === 'one' && f1 === 'zero') inverse.set(r = add('$not', { A: x, Y: newBits(k) }), x);
      else if (f0 === 'zero') r = add('$and', { A: x, B: f1, Y: newBits(k) });
      else if (f1 === 'zero') r = add('$and', { A: add('$not', { A: x, Y: newBits(k) }), B: f0, Y: newBits(k) });
      else if (f1 === 'one') r = add('$or', { A: x, B: f0, Y: newBits(k) });
      else if (f0 === 'one') r = add('$or', { A: add('$not', { A: x, Y: newBits(k) }), B: f1, Y: newBits(k) });
      else r = add('$bwmux', { A: f0, B: f1, S: x, Y: newBits(k) });
      memo.set(key, r);
      return r;
    };
    const r = node(t2, order.length);
    // (the last cell's outputs the LUTs' bits; else a copy)
    const last = Object.values(cells).find(c => c.connections.Y === r);
    if (last && typeof r !== 'string') last.connections.Y = a.bits;
    else add('$pos', { A: r === 'one' ? ones : r === 'zero' ? zeros : r, Y: a.bits });
  }

  // ---- the cells no longer read (an inverter of an XOR's S), but those of a named net
  const named = new Set(Object.values(mod.netnames || {}).filter(n => !n.hide_name).flatMap(n => n.bits));
  for (let gone = true; gone;) {
    gone = false;
    const used = new Set(Object.values(mod.ports || {}).filter(p => p.direction !== 'input').flatMap(p => p.bits));
    for (const c of Object.values(cells)) for (const [port, bits] of Object.entries(c.connections)) if (port !== 'Y' && port !== 'Q') bits.forEach(b => used.add(b));
    for (const [name, c] of Object.entries(cells)) {
      if (!c.connections.Y || !(GATES.has(c.type) || ['$shiftx', '$pos', '$add', '$bwmux'].includes(c.type))) continue;
      if (c.connections.Y.some(b => used.has(b) || named.has(b))) continue;
      delete cells[name]; gone = true;
    }
  }

  return { json, stats: { chains: nChains, registers: groups.length, cells: [before, Object.keys(cells).length] } };
}
