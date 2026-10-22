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

export const GATES = new Set(['$and', '$or', '$xor', '$not', '$mux']);
import { mountBitCells } from './compiled-words-bits.js';
import { mountRegisterProposals } from './compiled-words-regs.js';
export const FFS = new Set(['$dff', '$dffe', '$aldff', '$aldffe', '$adff', '$adffe', '$sdff', '$sdffe', '$sdffce']);
export const FF_DATA = ['D', 'AD'];                       // a flip-flop's ports of one bit each
export const FF_VALUES = ['ARST_VALUE', 'SRST_VALUE'];    // its parameters of one bit each
const MAXW = 31;     // the bits of a word at most (a number, its carry out the 32nd)
export const MIN_CHAIN = 3; // the stages of a carry chain made an addition, at least
export const DEPTH = 12;    // the cells a word is looked for through, at most

export function permutations(n) {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap(p => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}
export const isConst = b => typeof b !== 'number';
const pbits = s => (typeof s === 'number' ? s.toString(2) : String(s)).split('').reverse().map(c => (c === '1' ? 1 : 0));
export const int = s => (typeof s === 'number' ? s : parseInt(String(s).replace(/[xz]/gi, '0'), 2));

/** The netlist (Yosys's JSON) with its gate-level logic at word level: { json: a copy, stats }. */
export function wordLevel(json, top) {
  json = structuredClone(json);
  const mod = json.modules[top];
  if (!mod) return { json, stats: { chains: 0, registers: 0, cells: [0, 0] } };
  const cells = mod.cells || {};
  const before = Object.keys(cells).length;
  // (the new cells' names: $words$…, $words2$… when made word level again, #659)
  let pass = 1;
  while (Object.keys(cells).some(n => n.startsWith(`$words${pass > 1 ? pass : ''}$`))) pass++;
  const W = `$words${pass > 1 ? pass : ''}$`;
  let fresh = 1 + Math.max(0, ...Object.values(cells).flatMap(c => Object.values(c.connections).flat().filter(b => !isConst(b))),
    ...Object.values(mod.ports || {}).flatMap(p => p.bits.filter(b => !isConst(b))), ...Object.values(mod.netnames || {}).flatMap(n => n.bits.filter(b => !isConst(b))));
  const newBits = k => Array.from({ length: k }, () => fresh++);

  // ---- the cells of one bit: drivers and readers (compiled-words-bits.js)
  const { cellAt, chains, driver, ff1, ffKey, readers } = mountBitCells({
    cells, mod
  });

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
    action.id = `${W}${actions.length + 1}`;
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
    const id = `${W}${actions.length + 1}`;
    actions.push({ kind: 'chain', id, p, S, DI });
    p.forEach((st, i) => { if (st.xor) place(cells[st.xor].connections.Y[0], `${id}s`, i); if (i < p.length - 1) place(st.out, `${id}c`, i + 1); });
    place(p.at(-1).out, `${id}s`, p.length);
    return true;
  }

  reset();
  // the registers: the flip-flops of a chain's S or DI (or of the cells computing them), of one kind, in its order (compiled-words-regs.js)
  const { proposals } = mountRegisterProposals({
    align, cellAt, cells, driver, ff1, ffKey, peel, pieces, sOf, segments
  });

  const used = new Set();
  let groups = proposals.filter(g => { if (g.some(n => used.has(n))) return false; g.forEach(n => used.add(n)); return true; })
    .flatMap(g => Array.from({ length: Math.ceil(g.length / MAXW) }, (_, j) => g.slice(j * MAXW, (j + 1) * MAXW))).filter(g => g.length >= 2);

  let data;
  // rounds: the registers, the chains, then each register's next value as a word; a register whose next value is
  // no word stays bits, and the round is done again without it
  for (;;) {
    reset();
    groups.forEach((g, j) => g.forEach((n, i) => place(cells[n].connections.Q[0], `${W}r${j}`, i)));
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
    const name = `${W}${Object.keys(cells).length}$${fresh}`;
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
    cells[`${W}r${j}`] = { hide_name: 1, type: c0.type, parameters: params, attributes: {}, port_directions: c0.port_directions, connections: conn };
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
