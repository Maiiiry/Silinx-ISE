// Silinx - the irregular logic of a gate-level netlist as lookup tables, for the compiled cycle simulator (#659): after
// core/compiled-words.js has made a synthesized netlist's carry chains additions and its registers words, what is left
// bit by bit is logic that is no word of cells side by side: comparators of a counter with constants (a carry chain
// whose stages are LUTs of other INITs), the next state of a state machine, the decoders. Here each cone of such
// one-bit cells (gates, multiplexers, LUTs) whose inputs are a few bits (`inputs` at most: of registers, words, ports)
// is a table of its outputs at every value of those inputs, a ROM ($mem_v2: no write port, one asynchronous read
// port), compileNetlist's memory read: one read for a cone of tens of cells, several outputs of the same inputs in one
// word of the table. The values are the netlist's, cycle for cycle (a constant 'x' or 'z' is 0, as compileNetlist
// has it).
//   - a cone's root: a one-bit cell of few inputs read by something else (a flip-flop, a word, a port, a cell of more
//     inputs) or driving a net of a name of the design (not netgen's _N_: the Watch box); the cells inside it,
//     read only by the cone, are gone (their nets read 0, as a carry chain's inner carries in compiled-words.js);
//   - the roots of the same inputs (or of fewer of them) in one table, 32 outputs at most;
//   - a table kept when it replaces more cells than it has outputs (a lone LUT is a table already).
//
//   const { json, stats } = coneTables(json, top)   // a copy; stats: { tables, inputs, words, outputs, equalities,
//                                                   // cells: [before, after] }
//   const { json, stats } = gateModel(json, top)    // wordLevel, the tables, wordLevel again (the registers the
//                                                   // tables feed), the tables' inputs in their words' order
//
// Isomorphic ES module (browser + Node), no DOM.

const INPUTS = 12;   // the inputs of a table at most (its words: 2^INPUTS)
const MIN_INPUTS = 10;   // (and at least, for a large netlist's tables, see BUDGET)
const BUDGET = 50000;    // the words of a netlist's tables at most (their inputs fewer, down to MIN_INPUTS)
const OUTS = 32;     // the outputs of a table at most (a word of compileNetlist's memories)
const LUT_IN = 6;    // the inputs of a LUT ($shiftx of a constant) at most
const EQ_MIN = 13;   // the bits an equality compares at least (fewer: a table's)
const EQ_MAX = 32;   // and at most (a number)

import { wordLevel } from './compiled-words.js';

const isConst = b => typeof b !== 'number';
const int = s => (typeof s === 'number' ? s : parseInt(String(s).replace(/[xz]/gi, '0'), 2));
const ANON = /^_\d+_(\.|$)/;   // (netgen's names of the nets it made: _418_, _418_.O)
// the inputs of a one-bit cell a table computes (a gate, a multiplexer, a LUT), else null
const insOf = c => {
  const C = c.connections;
  if (!C.Y || C.Y.length !== 1) return null;
  if (c.type === '$not') return C.A.length === 1 ? [C.A[0]] : null;
  if (c.type === '$and' || c.type === '$or' || c.type === '$xor') return C.A.length === 1 && C.B.length === 1 ? [C.A[0], C.B[0]] : null;
  if (c.type === '$mux') return C.A.length === 1 && C.S.length === 1 ? [C.A[0], C.B[0], C.S[0]] : null;
  if (c.type === '$shiftx' && C.A.every(isConst) && C.B.length <= LUT_IN && !int(c.parameters?.B_SIGNED ?? 0)) return C.B.slice();
  return null;
};
const outPort = (c, port) => c.port_directions?.[port] === 'output' || (!c.port_directions && /^(Y|Q|RD_DATA)$/.test(port));

/** A synthesized netlist made fast (#650, #659): { json: a copy, stats: { words, tables, registers } }. */
export function gateModel(json, top, opts = {}) {
  const w = wordLevel(json, top), e = equalities(w.json, top);
  // (#659: tables of fewer inputs when theirs are too large, BUDGET words in all at most: pong's 65 000 words of
  // tables of 12 inputs ran slower in Chrome than its 37 000 of 11)
  let t;
  for (let k = opts.inputs ?? INPUTS; ; k--) {
    t = coneTables(e.json, top, { ...opts, inputs: k });
    if (opts.inputs != null || k <= MIN_INPUTS || t.stats.words <= BUDGET) break;
  }
  const r = wordLevel(t.json, top);
  inputOrder(r.json, top);
  // (the nets no longer computed, inside a table or a carry chain, no longer listed: the Watch box does not show them)
  const mod = r.json.modules[top];
  if (mod) {
    const driven = new Set(Object.values(mod.ports || {}).filter(p => p.direction === 'input').flatMap(p => p.bits));
    for (const c of Object.values(mod.cells || {})) for (const [port, bits] of Object.entries(c.connections)) if (outPort(c, port)) bits.forEach(b => driven.add(b));
    for (const [nm, n] of Object.entries(mod.netnames || {})) if (n.bits.some(b => !isConst(b) && !driven.has(b))) delete mod.netnames[nm];
  }
  return { json: r.json, stats: { words: w.stats, equalities: e.stats, tables: t.stats, registers: r.stats.registers } };
}

/** The inputs of each table (in place) in the order of their words' bits, its contents in that order (the address
 *  read in fewer pieces once wordLevel has made registers of the flip-flops it reads). */
export function inputOrder(json, top) {
  const mod = json.modules[top], cells = mod?.cells || {};
  const driver = new Map();
  for (const [name, c] of Object.entries(cells)) for (const [port, bits] of Object.entries(c.connections)) if (outPort(c, port)) bits.forEach((b, i) => { if (!isConst(b)) driver.set(b, [name, port, i]); });
  const key = b => driver.get(b) || ['', '', b];
  const cmp = (a, b) => { const x = key(a), y = key(b); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : x[2] - y[2]; };
  for (const c of Object.values(cells)) {
    if (c.type !== '$mem_v2' || !String(c.parameters.MEMID).startsWith('$tables$')) continue;
    const A = c.connections.RD_ADDR, n = A.length, k = int(c.parameters.WIDTH);
    const perm = A.map((_, j) => j).sort((x, y) => cmp(A[x], A[y]));   // new position j: old input perm[j]
    if (perm.every((x, j) => x === j)) continue;
    const old = c.parameters.INIT, size = 1 << n, init = new Array(size * k);
    // (INIT: the bits from the last, output q at address a its (a * k + q)th)
    const at = (a, q) => size * k - 1 - (a * k + q);
    for (let a = 0; a < size; a++) {
      let o = 0;
      for (let j = 0; j < n; j++) if ((a >> j) & 1) o |= 1 << perm[j];
      for (let q = 0; q < k; q++) init[at(a, q)] = old[at(o, q)];
    }
    c.parameters.INIT = init.join('');
    c.connections.RD_ADDR = perm.map(x => A[x]);
  }
  return json;
}

// the cells' outputs: bit -> [cell name, port, index]; the bits in the order of their cells' words (a cell's name, its
// port, the bit's position)
function drivers(cells) {
  const driver = new Map();
  for (const [name, c] of Object.entries(cells)) for (const [port, bits] of Object.entries(c.connections)) if (outPort(c, port)) bits.forEach((b, i) => { if (!isConst(b)) driver.set(b, [name, port, i]); });
  const key = b => driver.get(b) || ['', '', b];
  const cmp = (a, b) => { const x = key(a), y = key(b); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : x[2] - y[2]; };
  return { driver, cmp };
}
// the one-bit cells no longer read (but those of a net of the design's names) removed, in place
function unread(mod, one) {
  const cells = mod.cells;
  for (let gone = true; gone;) {
    gone = false;
    const used = new Set(Object.values(mod.ports || {}).filter(p => p.direction !== 'input').flatMap(p => p.bits));
    for (const [nm, n] of Object.entries(mod.netnames || {})) if (!n.hide_name && !ANON.test(nm)) n.bits.forEach(b => used.add(b));
    for (const c of Object.values(cells)) for (const [port, bits] of Object.entries(c.connections)) if (!outPort(c, port)) bits.forEach(b => used.add(b));
    for (const name of one.keys()) {
      if (!cells[name] || used.has(cells[name].connections.Y[0])) continue;
      delete cells[name]; gone = true;
    }
  }
}

/** The one-bit cells that are an AND of their bits' values (a comparison of a counter with a constant, as LUTs of 4 of
 *  its bits each and the LUT of their results), each one equality ($eq) of those bits with the constant when it compares
 *  `min` bits or more, 32 at most, before the tables (#670: their cones then not tables, fewer words; an equality of
 *  two words' bits as well, a ^ b = v, was slower): { json: a copy, stats: { equalities, cells: [before, after] } }. */
export function equalities(json, top, { min = EQ_MIN } = {}) {
  json = structuredClone(json);
  const mod = json.modules[top];
  if (!mod) return { json, stats: { equalities: 0, cells: [0, 0] } };
  const cells = mod.cells || {};
  const before = Object.keys(cells).length;
  const { driver, cmp } = drivers(cells);
  const one = new Map();
  for (const [name, c] of Object.entries(cells)) { const ins = insOf(c); if (ins) one.set(name, ins); }
  const cellOf = b => { const d = !isConst(b) && driver.get(b); return d && one.has(d[0]) ? d[0] : null; };

  // a cell's function as such a conjunction: its terms, Map bit -> value, over the bits it reads or those such cells
  // at 1 read; null when it is none
  const terms = new Map();
  const termsOf = (name) => {
    if (terms.has(name)) return terms.get(name);
    terms.set(name, null);   // (a loop: none)
    const c = cells[name];
    let ins = one.get(name), table;
    if (c.type === '$shiftx') table = Array.from({ length: 1 << ins.length }, (_, m) => (c.connections.A[m] === '1' ? 1 : 0));
    else if (c.type === '$and') table = [0, 0, 0, 1];
    else if (c.type === '$not') table = [1, 0];
    else return null;
    // (its constant inputs folded)
    for (let j = ins.length - 1; j >= 0; j--) {
      if (!isConst(ins[j])) continue;
      const v = ins[j] === '1' ? 1 : 0;
      table = table.filter((_, m) => ((m >> j) & 1) === v);
      ins = ins.filter((_, k) => k !== j);
    }
    // (the inputs each of its ones has at one value: a conjunction of them when it has as many ones as they allow)
    const n = ins.length, ones = table.flatMap((x, m) => (x ? [m] : [])), bit = (m, i) => (m >> i) & 1;
    if (!ones.length) return null;
    const fixed = ins.map((_, i) => i).filter(i => ones.every(m => bit(m, i) === bit(ones[0], i)));
    if (ones.length !== 2 ** (n - fixed.length)) return null;
    const r = new Map();
    for (const i of fixed) {
      const v = bit(ones[0], i), d = v ? cellOf(ins[i]) : null, sub = d && termsOf(d);
      // (a bit at two values: the conjunction is 0, left to the cells)
      for (const [b, w] of sub || [[ins[i], v]]) { if (r.has(b) && r.get(b) !== w) return null; r.set(b, w); }
    }
    terms.set(name, r);
    return r;
  };
  const wide = name => { const t = termsOf(name); return !!t && t.size >= min && t.size <= EQ_MAX; };

  // the roots: such cells read by others (or of a net of the design's names), each an equality
  const read = new Set();
  for (const [name, c] of Object.entries(cells)) {
    if (one.has(name) && wide(name)) continue;
    for (const [port, bits] of Object.entries(c.connections)) if (!outPort(c, port)) bits.forEach(b => read.add(b));
  }
  for (const p of Object.values(mod.ports || {})) if (p.direction !== 'input') p.bits.forEach(b => read.add(b));
  for (const [nm, n] of Object.entries(mod.netnames || {})) if (!n.hide_name && !ANON.test(nm)) n.bits.forEach(b => read.add(b));
  const roots = [...one.keys()].filter(name => wide(name) && read.has(cells[name].connections.Y[0]));
  let eqs = 0;
  for (const name of roots) {
    // (its bits in the order of their words: read in few pieces)
    const t = termsOf(name), A = [...t.keys()].sort(cmp), w = A.length;
    cells[`$tables$eq${++eqs}`] = { hide_name: 1, type: '$eq', attributes: {}, parameters: { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: w, B_WIDTH: w, Y_WIDTH: 1 },
      connections: { A, B: A.map(b => String(t.get(b))), Y: cells[name].connections.Y } };
    delete cells[name];
  }
  unread(mod, one);
  return { json, stats: { equalities: eqs, cells: [before, Object.keys(cells).length] } };
}

/** The netlist (Yosys's JSON, after wordLevel) with its cones of few inputs as lookup tables: { json: a copy, stats }. */
export function coneTables(json, top, { inputs: K = INPUTS } = {}) {
  json = structuredClone(json);
  const mod = json.modules[top];
  if (!mod) return { json, stats: { tables: 0, inputs: K, words: 0, outputs: 0, cells: [0, 0] } };
  const cells = mod.cells || {};
  const before = Object.keys(cells).length;

  // ---- the one-bit cells a table computes: their inputs
  const driver = new Map();   // bit -> [cell name, port, index]
  const one = new Map();      // a one-bit cell's name -> its inputs
  for (const [name, c] of Object.entries(cells)) {
    for (const [port, bits] of Object.entries(c.connections)) {
      if (outPort(c, port)) bits.forEach((b, i) => { if (!isConst(b)) driver.set(b, [name, port, i]); });
    }
    const ins = insOf(c);
    if (ins) one.set(name, ins);
  }
  const cellOf = b => { const d = !isConst(b) && driver.get(b); return d && one.has(d[0]) ? d[0] : null; };

  // ---- each one-bit cell's inputs through the others (its support): the leaves (the bits of other cells, of the
  // ports, of one-bit cells of more inputs), BIG above K of them
  const BIG = null, support = new Map();
  let loop = false;
  const leaf = b => { const d = cellOf(b); return !d || support.get(d) === BIG; };
  const visiting = new Set();
  const compute = (n) => {
    let s = new Set();
    for (const b of one.get(n)) {
      if (isConst(b)) continue;
      if (leaf(b)) s.add(b); else support.get(cellOf(b)).forEach(x => s.add(x));
      if (s.size > K) return BIG;
    }
    return s;
  };
  // (a depth-first walk with a stack of its own: a carry chain of tens of stages)
  for (const name of one.keys()) {
    if (support.has(name)) continue;
    const stack = [[name, 0]];
    visiting.add(name);
    while (stack.length && !loop) {
      const top = stack[stack.length - 1], ins = one.get(top[0]);
      if (top[1] >= ins.length) { stack.pop(); visiting.delete(top[0]); support.set(top[0], compute(top[0])); continue; }
      const d = cellOf(ins[top[1]++]);
      if (!d || support.has(d)) continue;
      if (visiting.has(d)) { loop = true; break; }
      visiting.add(d);
      stack.push([d, 0]);
    }
    if (loop) break;
  }
  // (a combinational loop: as it is, compileNetlist's error)
  if (loop) return { json, stats: { tables: 0, inputs: K, words: 0, outputs: 0, cells: [before, before] } };
  const small = n => !!support.get(n);

  // ---- the roots: small cells read outside the small ones, or of a net of the design's names
  const readBy = new Map();   // bit -> 'out' (something else) | 'in' (small cells only)
  const mark = (b, how) => { if (!isConst(b) && readBy.get(b) !== 'out') readBy.set(b, how); };
  for (const [name, c] of Object.entries(cells)) {
    const inner = small(name);
    for (const [port, bits] of Object.entries(c.connections)) {
      if (outPort(c, port)) continue;
      bits.forEach(b => mark(b, inner ? 'in' : 'out'));
    }
  }
  for (const p of Object.values(mod.ports || {})) if (p.direction !== 'input') p.bits.forEach(b => mark(b, 'out'));
  for (const [nm, n] of Object.entries(mod.netnames || {})) if (!n.hide_name && !ANON.test(nm)) n.bits.forEach(b => mark(b, 'out'));
  const roots = [...one.keys()].filter(n => small(n) && support.get(n).size && readBy.get(cells[n].connections.Y[0]) === 'out');

  // ---- the cells of a root's cone
  const coneOf = (root) => {
    const seen = new Set([root]), stack = [root];
    while (stack.length) for (const b of one.get(stack.pop())) { const d = cellOf(b); if (d && !leaf(b) && !seen.has(d)) { seen.add(d); stack.push(d); } }
    return seen;
  };

  // ---- each bit's combinational depth: 0 for a flip-flop's, a port's, a synchronous read's; else one more than its
  // cell's inputs' (a cell with an output Y, a ROM's asynchronous read)
  const depth = new Map();
  const inputsOf = (name) => {
    const c = cells[name];
    if (c.type === '$mem_v2') return int(c.parameters.RD_CLK_ENABLE) ? null : c.connections.RD_ADDR;
    return c.connections.Y ? Object.entries(c.connections).filter(([p]) => p !== 'Y').flatMap(([, b]) => b) : null;
  };
  // (a depth-first walk with a stack of its own: [bit, its inputs, the next of them])
  const insAt = b => { const d = driver.get(b); return (d && inputsOf(d[0]) || []).filter(x => !isConst(x)); };
  const depthOf = (bit) => {
    const stack = [[bit, insAt(bit), 0]], open = new Set([bit]);
    while (stack.length) {
      const top = stack[stack.length - 1], [b, ins] = top;
      if (top[2] < ins.length) {
        const x = ins[top[2]++];
        // (a loop: the walk cut there, the depth any; then no table makes it one more, see below)
        if (!depth.has(x) && !open.has(x)) { open.add(x); stack.push([x, insAt(x), 0]); }
        continue;
      }
      depth.set(b, ins.length ? 1 + Math.max(...ins.map(x => depth.get(x) ?? 0)) : 0);
      open.delete(b);
      stack.pop();
    }
    return depth.get(bit);
  };
  const D = b => (isConst(b) ? 0 : depth.has(b) ? depth.get(b) : depthOf(b));

  // ---- the tables: the roots of the most inputs first, each in the first table its inputs fit in, else a table of
  // its own. (A root deeper than every input of the table it joins: each table's outputs deeper than its inputs, every
  // path of the netlist deeper and deeper, so no table makes a loop of what was none.)
  const tables = [];
  for (const r of roots.sort((a, b) => support.get(b).size - support.get(a).size)) {
    const s = support.get(r), dr = D(cells[r].connections.Y[0]);
    const t = tables.find(t => t.roots.length < OUTS && dr > t.deep && [...s].every(b => t.ins.has(b)));
    if (t) t.roots.push(r); else tables.push({ ins: new Set(s), roots: [r], deep: Math.max(...[...s].map(D)) });
  }
  // (worth it: more cells than outputs)
  const kept = tables.filter(t => { t.cone = new Set(t.roots.flatMap(r => [...coneOf(r)])); return t.cone.size > t.roots.length; });

  // ---- each table's contents: its cone evaluated at every value of its inputs at once, 32 values a word
  const order = b => { const d = driver.get(b); return d ? [d[0], d[1], d[2]] : ['', '', b]; };
  const cmp = (a, b) => { const x = order(a), y = order(b); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : x[2] - y[2]; };
  let mems = 0, outputs = 0, words = 0;
  for (const t of kept) {
    // (the inputs in the order of their words' bits: the address read in a few pieces)
    const ins = [...t.ins].sort(cmp), n = ins.length, size = 1 << n, nw = Math.max(1, size >> 5);
    const val = new Map();   // bit -> Uint32Array of nw words (bit a: the value at address a)
    ins.forEach((b, j) => {
      const v = new Uint32Array(nw);
      for (let a = 0; a < Math.min(size, 32 * nw); a++) if ((a >> j) & 1) v[a >> 5] |= 1 << (a & 31);
      val.set(b, v);
    });
    const ZERO = new Uint32Array(nw), ONES = new Uint32Array(nw).fill(-1);
    const get = b => (isConst(b) ? (b === '1' ? ONES : ZERO) : val.get(b) || evalCell(cellOf(b)));
    function evalCell(name) {
      const c = cells[name], C = c.connections, out = new Uint32Array(nw);
      if (c.type === '$shiftx') {
        const B = C.B.map(get);
        for (let m = 0; m < C.A.length && m < 1 << B.length; m++) {
          if (C.A[m] !== '1') continue;
          for (let w = 0; w < nw; w++) {
            let x = -1;
            for (let j = 0; j < B.length; j++) x &= (m >> j) & 1 ? B[j][w] : ~B[j][w];
            out[w] |= x;
          }
        }
      } else {
        const [a, b, s] = one.get(name).map(get);
        for (let w = 0; w < nw; w++) {
          out[w] = c.type === '$not' ? ~a[w] : c.type === '$and' ? a[w] & b[w] : c.type === '$or' ? a[w] | b[w] : c.type === '$xor' ? a[w] ^ b[w] : (a[w] & ~s[w]) | (b[w] & s[w]);
        }
      }
      val.set(C.Y[0], out);
      return out;
    }
    const k = t.roots.length, data = t.roots.map(r => get(cells[r].connections.Y[0]));
    // (INIT: the words from the last address, each from its last output)
    const init = [];
    for (let a = size - 1; a >= 0; a--) for (let o = k - 1; o >= 0; o--) init.push((data[o][a >> 5] >>> (a & 31)) & 1);
    const Y = t.roots.map(r => cells[r].connections.Y[0]);
    cells[`$tables$${++mems}`] = {
      hide_name: 1, type: '$mem_v2', attributes: {},
      parameters: {
        MEMID: `$tables$${mems}`, SIZE: size, OFFSET: 0, ABITS: n, WIDTH: k, INIT: init.join(''),
        RD_PORTS: 1, RD_CLK_ENABLE: '0', RD_CLK_POLARITY: '1', RD_TRANSPARENCY_MASK: '', RD_COLLISION_X_MASK: '', RD_WIDE_CONTINUATION: '0',
        RD_CE_OVER_SRST: '0', RD_ARST_VALUE: '0'.repeat(k), RD_SRST_VALUE: '0'.repeat(k), RD_INIT_VALUE: '0'.repeat(k),
        WR_PORTS: 0, WR_CLK_ENABLE: '', WR_CLK_POLARITY: '', WR_PRIORITY_MASK: '', WR_WIDE_CONTINUATION: '',
      },
      port_directions: { RD_CLK: 'input', RD_EN: 'input', RD_ARST: 'input', RD_SRST: 'input', RD_ADDR: 'input', RD_DATA: 'output', WR_CLK: 'input', WR_EN: 'input', WR_ADDR: 'input', WR_DATA: 'input' },
      connections: { RD_CLK: ['x'], RD_EN: ['1'], RD_ARST: ['0'], RD_SRST: ['0'], RD_ADDR: ins, RD_DATA: Y, WR_CLK: [], WR_EN: [], WR_ADDR: [], WR_DATA: [] },
    };
    outputs += k;
    words += size;
  }

  // ---- the roots, then the one-bit cells no longer read
  for (const t of kept) for (const c of t.roots) delete cells[c];
  unread(mod, one);
  return { json, stats: { tables: mems, inputs: K, words, outputs, cells: [before, Object.keys(cells).length] } };
}
