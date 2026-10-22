// Silinx - the compiled simulator's activity (#405: out of compileNetlist in core/compiled-sim.js, #464): the
// combinational cells in blocks by the values they read, their keys and costs, in an order their dependencies keep.
import { DETECT, OPS } from './compiled-helpers.js';

/** { always, blocksOf, weightOf } of compileNetlist. */
export function mountActivity(ctx) {
  const {
    activity, cellExpr, clkBit, combOf, dcms, inBits, main, mainPort, mems, onMain, order, src, usesMain, vars
  } = ctx;

  // ---- activity (#464): the combinational cells in blocks by the values they read, each block evaluated only
  // when one of them changed since the last evaluation. A change is a bit of the dirty words D<j>, set by the main
  // clock's commits (its flip-flops, its memories' writes) and by the cuts (a cell whose value changes much less
  // often than what it reads: a counter's end, #670: any cell of a number, those the profile finds changing about
  // as often as what they read no cuts), cleared after each evaluation; bit 0 (all): every block. A value read in
  // part is a key of its bits read (a counter's high bits change seldom). A block reading a value that changes at
  // every step (the main clock's, a DCM's output) is always evaluated; the values with no bit (the inputs, the
  // other clocks' flip-flops, the latches, the asynchronous loads) change between runs or when settling, after
  // which every block is (all).
  const always = new Set(dcms.flatMap(d => Object.values(d.outs)));
  if (mainPort && usesMain) always.add(mainPort.v);
  const flagged = new Set(onMain.filter(e => e.q != null).map(e => e.q));
  const memFlagged = new Set(mems.filter(m => m.writes.some(w => clkBit(w) === main)).map(m => m.k));
  const varsIn = n => [...new Set(inBits(n).map(b => (typeof b === 'number' ? src.get(b)?.[0] : null)).filter(v => v != null))];
  // (#670: a value of a number's kind read in part, a key of its bits read: 'v<var>&<mask>'; a counter's high bits
  // change much less often than its low ones)
  const keyOf = (v, mask) => (vars[v].kind === 'n' && mask !== (vars[v].w >= 32 ? -1 : 2 ** vars[v].w - 1) ? `v${v}&${mask}` : `v${v}`);
  const masksIn = n => {
    const m = new Map();
    for (const b of inBits(n)) {
      const s = typeof b === 'number' ? src.get(b) : null;
      if (s) m.set(s[0], (m.get(s[0]) || 0) | (1 << s[1]));
    }
    return m;
  };
  // (#670: a cell's cost, as cells, from its operations: a table's address of ten bits, ten times a NOT's)
  const weightOf = n => Math.max(1, (cellExpr(n).match(/>>>|<<|>>|[-+*&|^~?[]|===|!==/g) || []).length / OPS);
  // the blocks (the cells reading the same values), in an order the cells' dependencies keep
  const blocksOf = () => {
    const reads = new Map();   // comb node -> { keys: Set ('v<var>', 'v<var>&<mask>', 'm<memory>'), always }
    for (const n of order) {
      n.cut = vars[n.y].kind === 'n' && !n.nocut;
      const r = { keys: new Set(), always: false };
      for (const [v, mask] of masksIn(n)) {
        const d = combOf.get(v);
        if (d) {
          if (d.cut) r.keys.add(keyOf(v, mask));
          else { const dr = reads.get(d); dr.keys.forEach(k => r.keys.add(k)); r.always ||= dr.always; }
        } else if (always.has(v)) r.always = true;
        else if (flagged.has(v)) r.keys.add(keyOf(v, mask));
      }
      if (n.type === '$memrd' && memFlagged.has(n.mem.k)) r.keys.add(`m${n.mem.k}`);
      r.always ||= !activity;
      reads.set(n, r);
      n.reads = r;
    }
    const keyed = new Set([...reads.values()].flatMap(r => [...r.keys].map(k => k.split('&')[0])));
    const blocks = new Map();   // key -> { cells, keys, always, deps: Set of blocks }
    for (const n of order) {
      const r = reads.get(n), key = r.always || !activity ? '*' : [...r.keys].sort().join(' ');
      if (!blocks.has(key)) blocks.set(key, { cells: [], keys: [...r.keys], always: r.always, deps: new Set(), weight: 0 });
      const b = blocks.get(key);
      b.cells.push(n);
      // (a cut read under a guard: its test of its changes)
      b.weight += weightOf(n) + (n.cut && keyed.has(`v${n.y}`) ? DETECT : 0);
      n.block = b;
    }
    for (const n of order) for (const v of varsIn(n)) { const d = combOf.get(v); if (d && d.block !== n.block) n.block.deps.add(d.block); }
    const order_ = [], placed = new Set();
    const place = (b) => { if (placed.has(b)) return; placed.add(b); b.deps.forEach(place); order_.push(b); };
    blocks.forEach(place);
    return order_;
  };

  return { always, blocksOf, weightOf };
}
