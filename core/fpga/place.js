// Silinx - placer: the sites of a packed design (core/fpga/pack.js) on a Spartan-3E device
// (browser + Node).
//
// Simulated annealing (in the manner of VPR): every slice, every group of slices that must keep
// its shape (a carry chain up a slice column, the slices of an F6 / F7 / F8 multiplexer), every
// pad without a LOC constraint and every block RAM and multiplier is an object; a move takes one
// object to another position nearby, a block RAM / multiplier to another site of its kind
// (swapping with what is there); the cost is the half-perimeter wirelength of the nets,
// weighted for nets with many pins, in units of a CLB, and (timing-driven, as VPR's placer) the
// estimated delay of every connection weighted by its criticality, the two normalised and mixed.
// Clock nets (from a BUFGMUX) run on the global clock lines and are left out. Moves that make the cost worse are accepted with a probability
// that falls as the temperature falls; the move window shrinks to keep about 44% of the moves
// accepted. Everything follows one seeded random generator: the same seed gives the same placement.
// Instances of type SLICEM (RAMs, shift registers) stay on SLICEM sites; a DCM takes its site (the
// packer's loc) and the global buffers its outputs reach (option bufgSites); a clock input with no
// LOC takes a free pad whose dedicated path of known bits reaches a global buffer (a GCLK pin).
//
//   const dev = deviceSites(parseXdlrc(text))   the sites with their positions
//   const r = place(packed, dev, { seed, effort })
//     r = { sites: [{ tile, site }] by instance, cost, stats: { moves, temps, seconds, initialCost } }
//   placedXdl(packed, r) -> a design for writeXdl (core/xdl.js)

import { instArcs, SPEED_4 } from './timing.js';

export class PlaceError extends Error {}

// I/O banks of the Spartan-3E: one per side (top 0, right 1, bottom 2, left 3), named by the I/O
// tile (TIOIS, RIOIS_PCI, BIBUFS, LIOIS_CLK_PCI…). Every I/O of a bank, input or output, shares the
// bank's output voltage (VCCO), which its I/O standard sets: ISE's DRC refuses a mix
// (PhysDesignRules:755, "IOB comp … is VCCO incompatible for bank …").
export const bankOfPad = p => ({ T: 0, R: 1, B: 2, L: 3 })[String(p.tile || '')[0]] ?? -1;
const VCCO = [[/^(LVTTL|LVCMOS33|PCI33_3|PCI66_3)$/, 3.3], [/^(LVCMOS25|LVDS_25|BLVDS_25|LVPECL_25|RSDS_25|MINI_LVDS_25|SSTL2_I|SSTL2_II|DIFF_SSTL2_I|DIFF_SSTL2_II)$/, 2.5],
  [/^(LVCMOS18|SSTL18_I|DIFF_SSTL18_I|HSTL_I_18|HSTL_III_18|DIFF_HSTL_I_18|DIFF_HSTL_III_18)$/, 1.8], [/^(LVCMOS15|HSTL_I|HSTL_III)$/, 1.5], [/^LVCMOS12$/, 1.2]];
/** The VCCO an I/O standard needs (null: unknown, no constraint). */
export const vccoOfStandard = std => VCCO.find(([re]) => re.test(String(std || '').toUpperCase()))?.[1] ?? null;

// ------------------------------------------------------------------ the device
/** Sites of the device by kind, with positions: slices by (x, y), pads by name, clock buffers.
 *  dev: parseXdlrc() of the device report, or the routing graph (core/fpga/device.js Device). */
export function deviceSites(dev) {
  const rows = dev.rows;
  const slices = new Map(), pads = new Map(), bufgmux = [], hard = { RAMB16: [], MULT18X18SIO: [] }, dcms = [];
  // the Device keeps the sites per tile as [name, bonded (0 internal, 1 bonded, 2 unbonded)]
  const tiles = dev.tiles || Array.from(dev.tileNames, (name, k) => ({
    name, r: dev.tileRow[k], c: dev.tileCol[k],
    sites: dev.tileSites[k].map(([n, b], i) => ({ name: n, type: dev.templates[dev.tileTemplate[k]].sites[i].type, bonded: b === 1 })),
  }));
  for (const t of tiles) {
    for (const s of t.sites) {
      let m;
      // physical position: tile column, tile row counted from the bottom (y grows upward as the
      // slice and CLB numbering does); the two slices of a column of a CLB half a tile apart
      if ((m = /^SLICE_X(\d+)Y(\d+)$/.exec(s.name))) {
        const x = +m[1], y = +m[2];
        slices.set(`${x},${y}`, { name: s.name, tile: t.name, type: s.type, x, y, px: t.c + (x % 2) * 0.5, py: rows - 1 - t.r + (y % 2) * 0.5 });
      } else if (/^(IOB|IBUF|DIFFM|DIFFS|DIFFMI|DIFFSI)$/.test(s.type) && s.bonded) {
        pads.set(s.name, { name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r, inputOnly: /^(IBUF|DIFFMI|DIFFSI)$/.test(s.type) });
      } else if (s.type === 'BUFGMUX') {
        bufgmux.push({ name: s.name, tile: t.name, px: t.c, py: rows - 1 - t.r });
      } else if (s.type === 'DCM') {
        dcms.push({ name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r });
      } else if (hard[s.type]) {
        // a block RAM and the multiplier of its tile (they share the tile's routing): four CLB rows
        // high, the site's tile at the top
        hard[s.type].push({ name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r - 1.5 });
      }
    }
  }
  return { part: dev.part, rows, cols: dev.cols, slices, pads, bufgmux, brams: hard.RAMB16, mults: hard.MULT18X18SIO, dcms };
}

// ------------------------------------------------------------------ random numbers
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the expected wirelength of a net with n pins is more than its bounding box for n > 3 (VPR's
// crossing-count correction)
const CROSS = [1, 1, 1, 1, 1.0828, 1.1536, 1.2206, 1.2823, 1.3385, 1.3991, 1.4493, 1.4974, 1.5455, 1.5937, 1.6418, 1.6899, 1.7304, 1.7709, 1.8114, 1.8519, 1.8924, 1.9288, 1.9652, 2.0015, 2.0379, 2.0743, 2.1061, 2.1379, 2.1698, 2.2016, 2.2334, 2.2646, 2.2958, 2.3271, 2.3583, 2.3895, 2.4187, 2.4479, 2.4772, 2.5064, 2.5356, 2.5610, 2.5864, 2.6117, 2.6371, 2.6625, 2.6887, 2.7148, 2.7410, 2.7671, 2.7933];
const crossing = n => (n < CROSS.length ? CROSS[n] : 2.7933 + 0.02616 * (n - 50));

// Clock buffers next to their pad: a BUFG driven straight from a pad on the top / bottom edge
// takes a global buffer of that edge (as ISE does: B8 -> BUFGMUX_X2Y11); others the first free one.
const BUFG_ORDER = ['BUFGMUX_X2Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y0'];

// ------------------------------------------------------------------ timing
// The delays of core/fpga/timing.js (fitted to ISE's timing analyzer): the paths through a slice from
// its settings (LUTs, F5 / F6 multiplexers, carry chain), the flip-flops' clock-to-out and setup,
// and a connection's delay from the distance it spans (dedicated ones, carry and multiplexer chains:
// none). The paths analysed are those of trce's clock period: flip-flop to flip-flop.
const DEDICATED_PINS = new Set(['CIN', 'FXINA', 'FXINB']);

/** Connections and their timing: every driver pin -> load pin of the nets (clocks and constants
 *  left out), with the arcs of each instance (timing.js instArcs: comb, setup, clkToOut) on a SLICEL
 *  and on a SLICEM site (arcs[inst] = [SLICEL, SLICEM]: the SLICEM's LUTs and F5 multiplexers are
 *  slower). */
export function timingGraph(packed, model = SPEED_4) {
  const conns = [];
  packed.nets.forEach((n, k) => {
    if (n.type !== 'wire' || !n.outpins.length) return;
    const src = n.outpins[0];
    if (packed.insts[src.inst].kind === 'bufg') return;
    for (const p of n.inpins) if (p.pin !== 'CLK') conns.push({ net: k, src: src.inst, srcPin: src.pin, dst: p.inst, dstPin: p.pin, dedicated: DEDICATED_PINS.has(p.pin) });
  });
  const none = { deps: {}, start: {}, setup: {} };
  const arcs = packed.insts.map(inst => {
    // block RAMs and multipliers: their own arcs (the same on any site)
    if (inst.kind === 'bram' || inst.kind === 'mult') {
      const a = instArcs({ type: inst.type, site: null, cfg: inst.cfg }, model);
      const deps = {}, start = {}, setup = {};
      for (const [i, o, d] of a.comb) (deps[o] ||= []).push([i, d]);
      for (const [o, d] of a.clkToOut) start[o] = d;
      for (const [i, d] of a.setup) setup[i] = Math.max(setup[i] ?? -Infinity, d);
      const x = { deps, start, setup };
      return [x, x];
    }
    if (inst.kind !== 'slice') return [none, none];
    // the site decides SLICEL / SLICEM (timing.js instArcs): an odd column of slices is a SLICEL
    return ['SLICE_X1Y0', 'SLICE_X0Y0'].map(site => {
      const a = instArcs({ type: 'SLICEL', site, cfg: inst.cfg }, model);
      const deps = {}, start = {}, setup = {};
      for (const [i, o, d] of a.comb) (deps[o] ||= []).push([i, d]);
      for (const [o, d] of a.clkToOut) start[o] = d;
      for (const [i, d] of a.setup) setup[i] = Math.max(setup[i] ?? -Infinity, d);
      return { deps, start, setup };
    });
  });
  return { conns, arcs, model };
}

/** The estimated delay of a connection between two positions ([x, y] in tiles, y upward): from the
 *  device's table of the fastest routes (timing.js delayTable: by tile offset) when given, else from
 *  the Manhattan distance (the model's dist). */
export function connDelay(a, b, model = SPEED_4, delays = null) {
  if (delays) return delays.at(Math.floor(b[0]) - Math.floor(a[0]), Math.floor(a[1]) - Math.floor(b[1]));
  const { base, perTile, knee, far } = model.dist;
  const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  return base + perTile * Math.min(d, knee) + far * Math.max(0, d - knee);
}

/** Static timing on a placement (ns, by the model): the critical path delay (flip-flop to
 *  flip-flop) and the criticality (0..1) of every connection. pos[inst] = [x, y] in tiles; delays:
 *  the device's delay table (connDelay). */
export function analyzeTiming(tg, pos, delays = null) {
  const { conns, model } = tg;
  // the arcs of each instance on its site: a SLICEM (an even column of slices) at a whole x
  const arcs = tg.arcs.map((a, i) => a[pos[i] && pos[i][0] % 1 === 0 ? 1 : 0]);
  const delay = c => (c.dedicated ? 0 : connDelay(pos[c.src], pos[c.dst], model, delays));
  // pins as nodes: `${inst}:${pin}`
  const into = new Map();    // input pin -> connections arriving
  const outOf = new Map();   // output pin -> connections leaving
  const key = (i, p) => `${i}:${p}`;
  for (const c of conns) {
    c.delay = delay(c);
    const a = key(c.dst, c.dstPin), b = key(c.src, c.srcPin);
    if (!into.has(a)) into.set(a, []);
    into.get(a).push(c);
    if (!outOf.has(b)) outOf.set(b, []);
    outOf.get(b).push(c);
  }
  // arrival at an input pin / an output pin (memoised depth-first; a loop counts as no path)
  const arrIn = (i, p) => { let t = -Infinity; for (const c of into.get(key(i, p)) || []) t = Math.max(t, arrOut(c.src, c.srcPin) + c.delay); return t; };
  const arr = new Map(), busy = new Set();
  const arrOut = (i, p) => {
    const k = key(i, p);
    if (arr.has(k)) return arr.get(k);
    if (arcs[i].start[p] !== undefined) { arr.set(k, arcs[i].start[p]); return arcs[i].start[p]; }
    if (busy.has(k)) return -Infinity;
    busy.add(k);
    let t = -Infinity;
    for (const [q, d] of arcs[i].deps[p] || []) t = Math.max(t, arrIn(i, q) + d);
    busy.delete(k);
    arr.set(k, t);
    return t;
  };
  let dmax = 0;
  for (const c of conns) {
    c.arr = arrOut(c.src, c.srcPin) + c.delay;
    const s = arcs[c.dst].setup[c.dstPin];
    if (s !== undefined && c.arr + s > dmax) dmax = c.arr + s;
  }
  // required times: at a setup pin dmax - setup, earlier when the pin passes on to an output
  const req = new Map();
  const reqIn = (i, p) => {
    let r = arcs[i].setup[p] !== undefined ? dmax - arcs[i].setup[p] : Infinity;
    for (const [o, ds] of Object.entries(arcs[i].deps)) for (const [q, d] of ds) if (q === p && outOf.has(key(i, o))) r = Math.min(r, reqOut(i, o) - d);
    return r;
  };
  const reqOut = (i, p) => {
    const k = key(i, p);
    if (req.has(k)) return req.get(k);
    req.set(k, Infinity);   // (loops)
    let r = Infinity;
    for (const c of outOf.get(k) || []) r = Math.min(r, reqIn(c.dst, c.dstPin) - c.delay);
    req.set(k, r);
    return r;
  };
  for (const c of conns) {
    const slack = reqIn(c.dst, c.dstPin) - c.arr;
    c.crit = dmax > 0 && Number.isFinite(slack) ? Math.max(0, Math.min(1, 1 - slack / dmax)) : 0;
  }
  return { dmax, conns };
}

/** Place a packed design. Options: seed (1), effort (1: moves per temperature scale with it),
 *  bufgSites(siteName, pin) (the global clock buffers a DCM output, or a pad's pin I, reaches: route.js bufgReach),
 *  timing (1.5: the weight of the timing cost, lambda = timing / (2 + timing) against 1 - lambda for
 *  the wirelength; 0: wirelength only), delays (timing.js delayTable(device): the delay of a
 *  connection by its offset; default: from the distance, the model's dist), clockSites (bufgmux site name -> Set of the slice sites its clock reaches, or null for all:
 *  the flip-flops of a clock are kept on them; route.js clockReach), log (function for progress lines). */
export function place(packed, dev, { seed = 1, effort = 1, timing = 1.5, clockSites = null, bufgSites = null, delays = null, log = null } = {}) {
  const t0 = Date.now();
  if (!dev.slices) throw new PlaceError('place: pass deviceSites(parseXdlrc(…))');
  const random = rng(seed);
  const ri = n => Math.floor(random() * n);
  const N = packed.insts.length;
  const sites = new Array(N).fill(null);     // inst -> site object
  const pos = new Array(N);                  // inst -> [px, py]
  let moves = 0, temps = 0;

  // ---------------------------------------------------------------- objects
  const objOf = new Array(N).fill(-1);
  const objs = [];
  const addObj = o => { o.id = objs.length; objs.push(o); return o; };
  for (const m of packed.macros) {
    const o = { kind: 'macro', members: m.members.map(x => ({ inst: x.inst, dx: x.dx, dy: x.dy })), align: m.align || [1, 1], anchor: null, macro: m.kind };
    for (const x of o.members) objOf[x.inst] = objs.length;
    addObj(o);
  }
  packed.insts.forEach((inst, i) => {
    if (objOf[i] >= 0) return;
    objOf[i] = objs.length;
    if (inst.kind === 'slice') addObj({ kind: 'macro', members: [{ inst: i, dx: 0, dy: 0 }], align: [1, 1], anchor: null });
    else if (inst.kind === 'iob') addObj({ kind: 'iob', inst: i, fixed: !!inst.loc, dir: inst.dir });
    else if (inst.kind === 'bufg') addObj({ kind: 'bufg', inst: i });
    else if (inst.kind === 'bram' || inst.kind === 'mult') addObj({ kind: inst.kind, inst: i });
    else if (inst.kind === 'dcm') addObj({ kind: 'dcm', inst: i, fixed: true });
    else throw new PlaceError(`place: unknown instance kind ${inst.kind}`);
  });

  // ---------------------------------------------------------------- pads and clock buffers
  const padUsed = new Map();   // pad name -> obj
  // the VCCO of each bank, from the I/O standards of the IOBs placed in it (bankOfPad, vccoOfStandard)
  const vccoOf = i => vccoOfStandard((packed.insts[i].cfg || []).find(c => c.attr === 'IOATTRBOX')?.value);
  const bankV = new Map();     // bank -> { v, n }
  const bankAdd = (p, v, k) => {
    if (v == null) return;
    const b = bankOfPad(p), e = bankV.get(b) || { v, n: 0 };
    e.n += k;
    if (e.n <= 0) bankV.delete(b); else bankV.set(b, e);
  };
  const bankOk = (p, v) => v == null || !bankV.has(bankOfPad(p)) || bankV.get(bankOfPad(p)).v === v;
  for (const o of objs) if (o.kind === 'iob' && o.fixed) {
    const inst = packed.insts[o.inst];
    const p = dev.pads.get(inst.loc);
    if (!p) throw new PlaceError(`place: ${inst.name}: LOC ${inst.loc} is not a bonded pad of ${dev.part}`);
    if (p.inputOnly && o.dir !== 'in') throw new PlaceError(`place: ${inst.name}: pad ${inst.loc} is input-only`);
    if (padUsed.has(p.name)) throw new PlaceError(`place: two ports on pad ${p.name}`);
    if (!bankOk(p, vccoOf(o.inst))) throw new PlaceError(`place: ${inst.name}: pad ${p.name} is in bank ${bankOfPad(p)}, whose other I/Os need VCCO ${bankV.get(bankOfPad(p)).v} V, not ${vccoOf(o.inst)} V (I/O standards)`);
    bankAdd(p, vccoOf(o.inst), 1);
    padUsed.set(p.name, o);
    sites[o.inst] = p;
  }
  const freePads = (dir, v) => [...dev.pads.values()].filter(p => !padUsed.has(p.name) && (dir === 'in' || !p.inputOnly) && bankOk(p, v));
  // a clock input with no LOC (its pad drives a global buffer straight): on a pad from which a
  // global buffer is reached through the dedicated clock paths of known bits (a GCLK pin, as ISE
  // places it: B8 -> BUFGMUX_X2Y11), the buffers in BUFG_ORDER's order, and kept there (#49)
  const bufgRank = new Map();
  [...BUFG_ORDER, ...dev.bufgmux.map(b => b.name)].forEach((n, k) => { if (!bufgRank.has(n)) bufgRank.set(n, k); });
  const drivesBufg = o => packed.nets.some(n => n.outpins[0]?.inst === o.inst && n.inpins.some(p => p.pin === 'I0' && packed.insts[p.inst].kind === 'bufg'));
  const padReach = new Map();   // pad name -> the buffers its dedicated paths of known bits reach
  const bufClaimed = new Set();
  if (bufgSites) for (const o of objs) if (o.kind === 'iob' && !o.fixed && o.dir === 'in' && drivesBufg(o)) {
    let best = null;
    for (const p of freePads('in', vccoOf(o.inst))) {
      if (!padReach.has(p.name)) padReach.set(p.name, bufgSites(p.name, 'I') || []);
      for (const b of padReach.get(p.name)) {
        const k = bufgRank.get(b) ?? Infinity;
        if (!bufClaimed.has(b) && (!best || k < best.k)) best = { p, b, k };
      }
    }
    if (!best) continue;   // no GCLK pin free: a pad like any other (general routing to the buffer)
    bufClaimed.add(best.b);
    bankAdd(best.p, vccoOf(o.inst), 1);
    padUsed.set(best.p.name, o);
    sites[o.inst] = best.p;
    o.fixed = o.gclk = true;
  }
  for (const o of objs) if (o.kind === 'iob' && !o.fixed) {
    const fp = freePads(o.dir, vccoOf(o.inst));
    if (!fp.length) throw new PlaceError('place: not enough pads');
    const p = fp[ri(fp.length)];
    bankAdd(p, vccoOf(o.inst), 1);
    padUsed.set(p.name, o);
    sites[o.inst] = p;
  }
  // DCMs: on their site (the packer gives the top-left one, the only one whose settings are in the
  // bit database), before the clock buffers they drive
  for (const o of objs) if (o.kind === 'dcm') {
    const inst = packed.insts[o.inst];
    const site = (dev.dcms || []).find(d => d.name === inst.loc);
    if (!site) throw new PlaceError(`place: ${inst.name}: no DCM site ${inst.loc} on ${dev.part}`);
    if (objs.some(x => x !== o && x.kind === 'dcm' && sites[x.inst] === site)) throw new PlaceError(`place: ${inst.name}: DCM site ${inst.loc} used twice (the other DCMs' settings are not in the bit database yet)`);
    sites[o.inst] = site;
  }
  // clock buffers: by the pad (or DCM) that drives them
  const bufUsed = new Set();
  const byName = new Map(dev.bufgmux.map(b => [b.name, b]));
  const driverOfPin = new Map();
  for (const n of packed.nets) for (const ip of n.inpins) driverOfPin.set(`${ip.inst}:${ip.pin}`, n.outpins[0]);
  // a buffer driven by a DCM output, or by a clock pad put on a GCLK pin: one of the buffers that
  // output reaches (bufgSites: the dedicated paths of known bits, route.js bufgReach), those first
  const reachOf = o => {
    const d = driverOfPin.get(`${o.inst}:I0`);
    if (d && padReach.size && objs[objOf[d.inst]].gclk) return new Set(padReach.get(sites[d.inst].name));   // a clock pad put on a GCLK pin
    return d && bufgSites && packed.insts[d.inst].kind === 'dcm' ? new Set(bufgSites(sites[d.inst].name, d.pin)) : null;
  };
  // (the most constrained first: a DCM output that reaches fewer buffers chooses before the others)
  const reachSize = o => reachOf(o)?.size ?? Infinity;
  const bufgObjs = objs.filter(o => o.kind === 'bufg').sort((a, b) => reachSize(a) - reachSize(b));
  for (const o of bufgObjs) {
    const d = driverOfPin.get(`${o.inst}:I0`);
    const pad = d && sites[d.inst];
    const top = pad && pad.py > dev.rows / 2;
    const reach = reachOf(o);
    const order = [...BUFG_ORDER.slice(top ? 0 : 4, top ? 4 : 8), ...BUFG_ORDER.slice(top ? 4 : 0, top ? 8 : 4), ...dev.bufgmux.map(b => b.name)];
    const b = order.map(n => byName.get(n)).find(b => b && !bufUsed.has(b.name) && (!reach || reach.has(b.name)));
    if (!b && reach) throw new PlaceError(`place: ${packed.insts[o.inst].name}: no free global clock buffer reachable from ${packed.insts[d.inst].name}.${d.pin} through switches of known bits${reach.size ? ` (${[...reach].join(', ')})` : ''}`);
    if (!b) throw new PlaceError('place: no free global clock buffer');
    bufUsed.add(b.name);
    sites[o.inst] = b;
  }
  // block RAMs and multipliers: on their sites (RAMB16_XxYy, MULT18X18_XxYy); a block RAM and the
  // multiplier of the same tile share the tile's routing: both only when the block RAM's ports are
  // at most 18 bits wide (Spartan-3E: the multiplier's inputs take the upper data bits)
  const hardSites = { bram: dev.brams || [], mult: dev.mults || [] };
  const hardUsed = { bram: new Map(), mult: new Map() };   // site name -> obj
  const tileUse = new Map();                                // tile -> { bram: obj, mult: obj }
  const wideBram = o => !!packed.insts[o.inst].wide;
  const hardOk = (o, site, other = null) => {
    const t = tileUse.get(site.tile) || {};
    const k = o.kind === 'bram' ? 'mult' : 'bram';
    const nb = t[k] && t[k] !== other ? t[k] : null;   // the neighbour in that tile (unless it moves away)
    return !nb || !(o.kind === 'bram' ? wideBram(o) : wideBram(nb));
  };
  const setHard = (o, site) => {
    const old = sites[o.inst];
    if (old && hardUsed[o.kind].get(old.name) === o) { hardUsed[o.kind].delete(old.name); delete (tileUse.get(old.tile) || {})[o.kind]; }
    hardUsed[o.kind].set(site.name, o);
    if (!tileUse.has(site.tile)) tileUse.set(site.tile, {});
    tileUse.get(site.tile)[o.kind] = o;
    sites[o.inst] = site;
  };
  // more than the device has: say so plainly, before trying them one by one (#19)
  for (const kind of ['bram', 'mult']) {
    const n = objs.filter(o => o.kind === kind).length, have = hardSites[kind].length;
    if (n > have) throw new PlaceError(`place: ${n} ${kind === 'bram' ? 'block RAMs' : 'multipliers'} needed, the device has ${have}`);
  }
  for (const o of objs) if (o.kind === 'bram' || o.kind === 'mult') {
    const inst = packed.insts[o.inst];
    const free = hardSites[o.kind].filter(s => !hardUsed[o.kind].has(s.name) && hardOk(o, s) && (!inst.loc || s.name === inst.loc));
    if (!free.length) throw new PlaceError(`place: ${inst.name}: no free ${o.kind === 'bram' ? 'block RAM' : 'multiplier'} site${inst.loc ? ` ${inst.loc}` : ''} (the device has ${hardSites[o.kind].length}${o.kind === 'bram' ? '' : '; a multiplier cannot share its tile with a block RAM of 36-bit ports'})`);
    o.fixed = !!inst.loc;
    setHard(o, free[ri(free.length)]);
  }
  // the slices a clock may reach (clockSites): the flip-flops of each clock stay on them
  const allowedOf = new Array(N).fill(null);
  if (clockSites) for (const n of packed.nets) {
    const d = n.outpins[0] && packed.insts[n.outpins[0].inst];
    if (!d || d.kind !== 'bufg') continue;
    const reach = clockSites(sites[n.outpins[0].inst].name);
    if (reach) for (const p of n.inpins) if (p.pin === 'CLK' && packed.insts[p.inst].kind === 'slice') allowedOf[p.inst] = reach;
  }
  // RAMs and shift registers (instances of type SLICEM) only on SLICEM sites (the left column of a CLB)
  const allowedAt = (i, k) => (!allowedOf[i] || allowedOf[i].has(dev.slices.get(k).name)) && (packed.insts[i].type !== 'SLICEM' || dev.slices.get(k).type === 'SLICEM');

  // ---------------------------------------------------------------- slices: legal anchors, occupancy
  const occ = new Map();   // `${x},${y}` -> inst
  const fitsAt = (o, x, y) => {
    if (x % o.align[0] || y % o.align[1]) return false;
    for (const m of o.members) {
      const k = `${x + m.dx},${y + m.dy}`;
      if (!dev.slices.has(k) || !allowedAt(m.inst, k)) return false;
    }
    return true;
  };
  const sliceList = [...dev.slices.values()];
  const maxX = Math.max(...sliceList.map(s => s.x)), maxY = Math.max(...sliceList.map(s => s.y));
  const setAt = (o, x, y) => {
    o.anchor = [x, y];
    for (const m of o.members) {
      const k = `${x + m.dx},${y + m.dy}`;
      occ.set(k, m.inst);
      sites[m.inst] = dev.slices.get(k);
    }
  };
  // initial placement: the largest groups first, each at a random free legal position near the
  // middle of the chip (then the annealing spreads and orders them)
  const slicesObjs = objs.filter(o => o.kind === 'macro').sort((a, b) => b.members.length - a.members.length);
  const total = slicesObjs.reduce((a, o) => a + o.members.length, 0);
  if (total > dev.slices.size) throw new PlaceError(`place: ${total} slices needed, the device has ${dev.slices.size}`);
  for (const o of slicesObjs) {
    let done = false;
    for (let tries = 0; tries < 20000 && !done; tries++) {
      // a window around the centre that grows with the attempts
      const r = Math.min(1, 0.25 + tries / 4000);
      const x = Math.floor(maxX / 2 + (random() - 0.5) * (maxX + 1) * r), y = Math.floor(maxY / 2 + (random() - 0.5) * (maxY + 1) * r);
      if (x < 0 || y < 0 || !fitsAt(o, x, y)) continue;
      if (o.members.some(m => occ.has(`${x + m.dx},${y + m.dy}`))) continue;
      setAt(o, x, y);
      done = true;
    }
    if (!done) {
      // exhaustive search
      outer: for (let x = 0; x <= maxX; x++) for (let y = 0; y <= maxY; y++) {
        if (!fitsAt(o, x, y) || o.members.some(m => occ.has(`${x + m.dx},${y + m.dy}`))) continue;
        setAt(o, x, y);
        done = true;
        break outer;
      }
    }
    if (!done) throw new PlaceError(`place: no room for a group of ${o.members.length} slices (${o.macro || 'slice'})`);
  }
  for (let i = 0; i < N; i++) { if (!sites[i]) throw new PlaceError(`place: ${packed.insts[i].name} not placed`); pos[i] = [sites[i].px, sites[i].py]; }

  // ---------------------------------------------------------------- nets and cost
  // nets for the cost: not the clocks (global lines), not the constants, not the carry links
  const nets = [];
  const netsOf = Array.from({ length: N }, () => []);
  for (const n of packed.nets) {
    if (n.type !== 'wire' || !n.outpins.length) continue;
    const d = packed.insts[n.outpins[0].inst];
    if (d.kind === 'bufg') continue;
    const pins = [...new Set([...n.outpins, ...n.inpins].map(p => p.inst))];
    if (pins.length < 2) continue;
    const k = nets.length;
    nets.push({ pins, base: crossing(pins.length), w: crossing(pins.length), cost: 0, src: n });
    for (const i of pins) netsOf[i].push(k);
  }
  const netCost = n => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of n.pins) { const [x, y] = pos[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return n.w * ((x1 - x0) + (y1 - y0));
  };
  let bb = 0;
  for (const n of nets) { n.cost = netCost(n); bb += n.cost; }
  const initialCost = bb;
  // timing (VPR's timing-driven placer): a second cost, the sum over the connections of
  // criticality^exp x estimated delay (the device's delay table when given), mixed with the
  // wirelength as lambda x timing / its value + (1 - lambda) x wirelength / its value, both
  // normalised at every temperature; the criticalities follow the placement (recomputed at every
  // temperature) and the exponent grows from 1 to 8 as the move window shrinks
  const tg = timing > 0 ? timingGraph(packed) : null;
  const lambda = tg ? timing / (2 + timing) : 0;
  const tconns = tg ? tg.conns.filter(c => !c.dedicated && c.src !== c.dst) : [];
  const connsOf = Array.from({ length: N }, () => []);
  tconns.forEach((c, j) => { c.w = 0; c.d = 0; connsOf[c.src].push(j); if (c.dst !== c.src) connsOf[c.dst].push(j); });
  let tc = 0, bbNorm = 1, tcNorm = 1, dmax = 0, critExp = 1;
  const cdelay = c => connDelay(pos[c.src], pos[c.dst], tg.model, delays);
  const reweight = () => {
    bb = 0;
    for (const n of nets) { n.cost = netCost(n); bb += n.cost; }
    bbNorm = Math.max(bb, 1e-9);
    if (!tg) return;
    const t = analyzeTiming(tg, pos, delays);
    dmax = t.dmax;
    tc = 0;
    for (const c of tconns) { c.w = c.crit ** critExp; c.d = cdelay(c); tc += c.w * c.d; }
    tcNorm = Math.max(tc, 1e-9);
  };
  const totalCost = () => (1 - lambda) * bb / bbNorm + lambda * tc / tcNorm;
  reweight();
  const initialDelay = dmax;

  // ---------------------------------------------------------------- moves
  const movable = objs.filter(o => (o.kind === 'macro') || (o.kind === 'iob' && !o.fixed) || ((o.kind === 'bram' || o.kind === 'mult') && !o.fixed && hardSites[o.kind].length > 1));
  if (!movable.length) return finish();
  // propose: returns the list of [inst, newSite] changes, or null
  let rlim = Math.max(maxX, maxY);
  const padsFor = { in: [...dev.pads.values()], out: [...dev.pads.values()].filter(p => !p.inputOnly) };
  function propose() {
    const o = movable[ri(movable.length)];
    if (o.kind === 'bram' || o.kind === 'mult') {
      // another site of its kind (swapping with the instance there)
      const cands = hardSites[o.kind];
      const p = cands[ri(cands.length)];
      const other = hardUsed[o.kind].get(p.name);
      if (other === o || (other && other.fixed)) return null;
      const cur = sites[o.inst];
      if (!hardOk(o, p, other) || (other && !hardOk(other, cur, o))) return null;
      const ch = [[o.inst, p]];
      if (other) ch.push([other.inst, cur]);
      return { ch, kind: 'hard', o, other, p };
    }
    if (o.kind === 'iob') {
      const cands = padsFor[o.dir === 'in' ? 'in' : 'out'];
      const p = cands[ri(cands.length)];
      const other = padUsed.get(p.name);
      if (other === o) return null;
      if (other && (other.fixed || (other.dir !== 'in' && sites[o.inst].inputOnly))) return null;
      // both I/Os must suit the VCCO of the bank they go to
      const old = sites[o.inst], vo = vccoOf(o.inst), vt = other ? vccoOf(other.inst) : null;
      bankAdd(old, vo, -1); if (other) bankAdd(p, vt, -1);
      const ok = bankOk(p, vo) && (!other || bankOk(old, vt)) && (bankOfPad(p) !== bankOfPad(old) || vo == null || vt == null || vo === vt);
      bankAdd(old, vo, 1); if (other) bankAdd(p, vt, 1);
      if (!ok) return null;
      const ch = [[o.inst, p]];
      if (other) ch.push([other.inst, sites[o.inst]]);
      return { ch, kind: 'iob', o, other, p };
    }
    const [ax, ay] = o.anchor;
    const r = Math.max(1, Math.round(rlim));
    const x = ax + ri(2 * r + 1) - r, y = ay + ri(2 * r + 1) - r;
    if ((x === ax && y === ay) || x < 0 || y < 0 || !fitsAt(o, x, y)) return null;
    const newKeys = o.members.map(m => `${x + m.dx},${y + m.dy}`);
    const oldKeys = new Set(o.members.map(m => `${ax + m.dx},${ay + m.dy}`));
    const displaced = [];
    for (const k of newKeys) {
      const i = occ.get(k);
      if (i === undefined || objOf[i] === o.id) continue;
      const oo = objs[objOf[i]];
      if (oo.members.length > 1) return null;   // only single slices step aside
      displaced.push(i);
    }
    const freed = [...oldKeys].filter(k => !newKeys.includes(k));
    if (displaced.some((i, j) => !allowedAt(i, freed[j]))) return null;
    const ch = o.members.map((m, j) => [m.inst, dev.slices.get(newKeys[j])]);
    displaced.forEach((i, j) => ch.push([i, dev.slices.get(freed[j])]));
    return { ch, kind: 'slice', o, x, y, displaced, freed };
  }
  function delta(ch) {
    const touched = new Set(), tTouched = new Set();
    for (const [i] of ch) { for (const k of netsOf[i]) touched.add(k); if (lambda) for (const j of connsOf[i]) tTouched.add(j); }
    const save = ch.map(([i]) => pos[i]);
    let dbb = 0, dtc = 0;
    for (const [i, s] of ch) pos[i] = [s.px, s.py];
    const newCosts = [], newDelays = [];
    for (const k of touched) { const c = netCost(nets[k]); newCosts.push([k, c]); dbb += c - nets[k].cost; }
    for (const j of tTouched) { const c = tconns[j], d = cdelay(c); newDelays.push([j, d]); dtc += c.w * (d - c.d); }
    ch.forEach(([i], j) => { pos[i] = save[j]; });
    return { d: (1 - lambda) * dbb / bbNorm + lambda * dtc / tcNorm, newCosts, newDelays, dbb, dtc };
  }
  function commit(mv, { newCosts, newDelays, dbb, dtc }) {
    if (mv.kind === 'hard') {
      const { o, other, p } = mv;
      const old = sites[o.inst];
      if (other) { hardUsed[o.kind].delete(p.name); setHard(o, p); setHard(other, old); pos[other.inst] = [old.px, old.py]; } else setHard(o, p);
      pos[o.inst] = [p.px, p.py];
    } else if (mv.kind === 'iob') {
      const { o, other, p } = mv;
      const old = sites[o.inst];
      const vo = vccoOf(o.inst), vt = other ? vccoOf(other.inst) : null;
      bankAdd(old, vo, -1); bankAdd(p, vo, 1);
      if (other) { bankAdd(p, vt, -1); bankAdd(old, vt, 1); }
      padUsed.delete(old.name);
      if (other) { padUsed.set(old.name, other); sites[other.inst] = old; pos[other.inst] = [old.px, old.py]; }
      padUsed.set(p.name, o); sites[o.inst] = p; pos[o.inst] = [p.px, p.py];
    } else {
      const { o, x, y, displaced, freed } = mv;
      const [ax, ay] = o.anchor;
      for (const m of o.members) occ.delete(`${ax + m.dx},${ay + m.dy}`);
      displaced.forEach((i, j) => {
        const s = dev.slices.get(freed[j]);
        occ.set(freed[j], i); sites[i] = s; pos[i] = [s.px, s.py];
        objs[objOf[i]].anchor = [s.x, s.y];
      });
      setAt(o, x, y);
      for (const m of o.members) pos[m.inst] = [sites[m.inst].px, sites[m.inst].py];
    }
    for (const [k, c] of newCosts) nets[k].cost = c;
    for (const [j, d] of newDelays) tconns[j].d = d;
    bb += dbb; tc += dtc;
  }

  // ---------------------------------------------------------------- annealing
  // initial temperature: 20 x the standard deviation of the cost changes of random moves
  const sample = [];
  for (let k = 0; k < Math.max(50, movable.length); k++) { const mv = propose(); if (mv) sample.push(delta(mv.ch).d); }
  const mean = sample.reduce((a, b) => a + b, 0) / Math.max(1, sample.length);
  const sd = Math.sqrt(sample.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sample.length));
  let T = 20 * sd || 1;
  const rlim0 = rlim;
  const perT = Math.max(100, Math.round(effort * 10 * Math.pow(movable.length, 4 / 3)));
  for (;;) {
    let acc = 0, tried = 0;
    for (let k = 0; k < perT; k++) {
      const mv = propose();
      if (!mv) continue;
      tried++;
      const dl = delta(mv.ch);
      if (dl.d <= 0 || random() < Math.exp(-dl.d / T)) { commit(mv, dl); acc++; }
    }
    moves += perT; temps++;
    critExp = 1 + 7 * Math.max(0, 1 - (rlim - 1) / Math.max(1, rlim0 - 1));
    reweight();
    const a = tried ? acc / tried : 0;
    // VPR's schedule: cool slowly while many moves are accepted
    T *= a > 0.96 ? 0.5 : a > 0.8 ? 0.9 : a > 0.15 ? 0.95 : 0.8;
    rlim = Math.min(Math.max(maxX, maxY), Math.max(1, rlim * (1 - 0.44 + a)));
    if (log && temps % 10 === 0) log(`T=${T.toFixed(4)} wirelength=${bb.toFixed(1)} delay=${dmax.toFixed(2)} accept=${a.toFixed(2)} rlim=${rlim.toFixed(1)}`);
    if (T < 0.005 * totalCost() / Math.max(1, nets.length) || temps > 400) break;
  }
  // a last greedy pass (temperature 0)
  for (let k = 0; k < perT; k++) { const mv = propose(); if (!mv) continue; const dl = delta(mv.ch); if (dl.d < 0) commit(mv, dl); }
  // the result: the wirelength (recomputed: no drift), and the estimated critical path
  reweight();
  if (!tg) dmax = analyzeTiming(timingGraph(packed), pos, delays).dmax;
  return finish();

  function finish() {
    return {
      sites: sites.map(s => ({ tile: s.tile, site: s.name })),
      cost: bb, delay: dmax, stats: { initialCost, initialDelay, moves, temps, seconds: (Date.now() - t0) / 1000, objects: objs.length },
    };
  }
}

/** The placed design, ready for writeXdl: instances with their sites, nets by instance name. */
export function placedXdl(packed, placement) {
  const insts = packed.insts.map((i, k) => ({ name: i.name, type: i.type, placed: true, tile: placement.sites[k].tile, site: placement.sites[k].site, cfg: i.cfg }));
  const nets = packed.nets.map(n => ({
    name: n.name, type: n.type,
    outpins: n.outpins.map(p => ({ inst: insts[p.inst].name, pin: p.pin })),
    inpins: n.inpins.map(p => ({ inst: insts[p.inst].name, pin: p.pin })),
    pips: [],
  }));
  return { name: packed.name, part: packed.part, cfg: packed.cfg || '', insts, nets };
}
