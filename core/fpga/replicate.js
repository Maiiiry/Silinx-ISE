// Silinx - register replication (browser + Node): a flip-flop that drives many loads on a critical
// path is copied, each copy driving the loads of one region of the chip, as XST and ISE's map do
// (#4). Every copy has the flip-flop's D, clock, enable, set / reset and initial value, so the
// circuit computes exactly what it did; its loads are nearer and each net lighter (the routing
// delay of a net grows with its spread and its branches: core/fpga/timing.js).
//
// The open flow places and routes the design, then (replicationPlan) takes the flip-flops whose
// output net has at least `minFanout` loads and a connection on or near the critical path
// (criticality >= minCrit by the routed timing analysis), splits each one's loads into groups by
// where the placement put them (k-means on the tiles), and (replicateFlipFlops) writes a netlist
// with a copy of the flip-flop per group but the one nearest the flip-flop. The flow packs, places
// and routes that netlist too and keeps whichever is faster.
//
//   const plan = replicationPlan(nl, packed, placement, sta)       // [] when nothing to do
//   const nl2 = replicateFlipFlops(nl, plan)                         // a new netlist (nl unchanged)

/** Defaults: loads of a flip-flop for it to be copied, criticality of its connections, loads per
 *  copy, copies at most, flip-flops at most. */
export const REPLICATION = { minFanout: 8, minCrit: 0.98, minDelay: 1.0, perCopy: 16, maxCopies: 8, maxFlipFlops: 8 };
/** The flows try it on designs of up to this many slices (it places and routes the design twice;
 *  the largest take minutes to place and route, #55). */
export const REPLICATE_MAX_SLICES = 3000;

const isFF = t => /^FD/.test(t);
const tileXY = name => { const m = /X(\d+)Y(\d+)$/.exec(name || ''); return m ? [+m[1], +m[2]] : null; };

/**
 * The flip-flops to copy and the groups of their loads. nl: readYosysJson's netlist; packed:
 * pack(nl) (its cellSites); placement: place()'s result (sites[inst] = { tile, site }); sta: the
 * timing analysis of the routed design (core/fpga/timing.js analyzeTiming: conns { from: 'inst.pin',
 * crit }). Returns [{ cell, groups: [[{ cell, pin }]] }] (groups[0] stays on the flip-flop).
 */
export function replicationPlan(nl, packed, placement, sta, opts = {}) {
  const o = { ...REPLICATION, ...opts };
  // the criticality of each flip-flop output (instance.XQ / YQ): its most critical connection, and
  // the longest delay of its connections that critical
  const crit = new Map(), slow = new Map();
  for (const c of sta.conns) if (/\.[XY]Q$/.test(c.from)) crit.set(c.from, Math.max(crit.get(c.from) ?? 0, c.crit));
  for (const c of sta.conns) if (/\.[XY]Q$/.test(c.from) && c.crit >= o.minCrit) slow.set(c.from, Math.max(slow.get(c.from) ?? 0, c.delay));
  const pos = packed.insts.map((_, k) => tileXY(placement.sites[k]?.tile));
  const cands = [];
  nl.cells.forEach((c, i) => {
    if (!isFF(c.type)) return;
    const at = packed.cellSites?.[i];
    if (!at || at.inst < 0 || !/^FF[XY]$/.test(at.bel) || packed.insts[at.inst].kind !== 'slice') return;
    const q = c.pins.Q;
    const loads = nl.nets[q]?.loads || [];
    if (loads.length < o.minFanout || nl.nets[q].const !== undefined) return;
    const out = `${packed.insts[at.inst].name}.${at.bel === 'FFX' ? 'XQ' : 'YQ'}`;
    const k = crit.get(out) ?? 0;
    if (k < o.minCrit || (slow.get(out) ?? 0) < o.minDelay) return;
    // the loads with a place (the ones the packer left out have none)
    const placed = loads.map(l => ({ ...l, p: pos[packed.cellSites[l.cell]?.inst] })).filter(l => l.p);
    if (placed.length < o.minFanout) return;
    cands.push({ cell: i, crit: k, loads: placed, home: pos[at.inst] });
  });
  cands.sort((a, b) => b.crit - a.crit || b.loads.length - a.loads.length || a.cell - b.cell);
  const plan = [];
  for (const c of cands.slice(0, o.maxFlipFlops)) {
    const k = Math.min(o.maxCopies + 1, Math.max(2, Math.ceil(c.loads.length / o.perCopy)));
    const groups = kmeans(c.loads, k);
    if (groups.length < 2) continue;
    // the group nearest the flip-flop keeps it
    const d = g => Math.min(...g.map(l => Math.abs(l.p[0] - c.home[0]) + Math.abs(l.p[1] - c.home[1])));
    groups.sort((a, b) => d(a) - d(b));
    plan.push({ cell: c.cell, groups: groups.map(g => g.map(({ cell, pin }) => ({ cell, pin }))) });
  }
  return plan;
}

// k groups of points (loads with p = [x, y]): k-means from k spread seeds (the farthest-first
// traversal from the first load), a few rounds; empty groups dropped. Deterministic.
function kmeans(items, k) {
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const centres = [items[0].p.slice()];
  while (centres.length < k) {
    let best = null, bd = -1;
    for (const it of items) { const dd = Math.min(...centres.map(c => dist(c, it.p))); if (dd > bd) { bd = dd; best = it; } }
    if (bd <= 0) break;
    centres.push(best.p.slice());
  }
  let assign = [];
  for (let round = 0; round < 8; round++) {
    assign = items.map(it => { let j = 0; for (let c = 1; c < centres.length; c++) if (dist(centres[c], it.p) < dist(centres[j], it.p)) j = c; return j; });
    for (let c = 0; c < centres.length; c++) {
      const mine = items.filter((_, i) => assign[i] === c);
      if (mine.length) centres[c] = [mine.reduce((s, it) => s + it.p[0], 0) / mine.length, mine.reduce((s, it) => s + it.p[1], 0) / mine.length];
    }
  }
  return centres.map((_, c) => items.filter((_, i) => assign[i] === c)).filter(g => g.length);
}

/**
 * A copy of the netlist with the flip-flops of the plan replicated: for each group after the first,
 * a new flip-flop `<name>_rep<k>` with the same type, parameters and inputs, driving a new net
 * `<Q net>_rep<k>` that the group's loads now read.
 */
export function replicateFlipFlops(nl, plan) {
  const cells = nl.cells.map(c => ({ ...c, pins: { ...c.pins } }));
  const nets = nl.nets.map(n => ({ ...n, loads: n.loads.map(l => ({ ...l })) }));
  const names = new Set(nets.map(n => n.name)), cellNames = new Set(cells.map(c => c.name));
  const unique = (set, base) => { let n = base, j = 1; while (set.has(n)) n = `${base}_${j++}`; set.add(n); return n; };
  for (const { cell, groups } of plan) {
    const ff = cells[cell], q = ff.pins.Q;
    groups.slice(1).forEach((group, g) => {
      const idx = cells.length, net = nets.length;
      const copy = { ...ff, name: unique(cellNames, `${ff.name}_rep${g + 1}`), pins: { ...ff.pins, Q: net }, attrs: { ...ff.attrs } };
      cells.push(copy);
      nets.push({ id: net, name: unique(names, `${nets[q].name}_rep${g + 1}`), driver: { cell: idx, pin: 'Q' }, port: null, loads: [] });
      // the copy reads what the flip-flop reads
      for (const [p, n] of Object.entries(ff.pins)) if (p !== 'Q' && ff.dirs?.[p] !== 'output') nets[n].loads.push({ cell: idx, pin: p });
      // the group's loads move to the copy's net
      const moving = new Set(group.map(l => `${l.cell}:${l.pin}`));
      nets[q].loads = nets[q].loads.filter(l => !moving.has(`${l.cell}:${l.pin}`));
      for (const l of group) { cells[l.cell].pins[l.pin] = net; nets[net].loads.push({ cell: l.cell, pin: l.pin }); }
    });
  }
  return { ...nl, cells, nets };
}
