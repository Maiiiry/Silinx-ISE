// Silinx - device measurements: testing joins with ISE's design rule check
// (research/s3e-device/README.md).
//
// A join hypothesis "wire A of tile T and wire B of tile U are one node" is tested by one net:
// from a slice output of T, through PIPs of T to A, then one PIP of U out of B (to any wire C).
// If A and B are one node, the net is one tree: ISE's DRC finds an antenna (C leads nowhere) and
// an unrouted sink, both expected. If they are not, the PIP out of B is cut off from the net, and
// the DRC also says "The network <name> has island(s)". One design holds thousands of such nets,
// each with its own source, its own wires and its own nodes, so one run of xdl -xdl2ncd -force and
// drc tests thousands of joins.

const splitKey = k => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

/** The outputs of a slice used as test sources, and the input each net ends on (unrouted). */
export const SOURCES = [['X', 'F1'], ['Y', 'G1']];

/**
 * Test designs for joins. opts:
 *   part, joins: [['TILE/WIRE', 'TILE/WIRE']],
 *   slicesOf(tile) -> [{ site, pos }] (the slices of a tile that can drive a test, pos 0-3),
 *   pinWire(pos, pin) -> the tile wire of a slice pin,
 *   pipsOf(tile) -> [[from, to]] (the PIPs known to exist in the tile, wire names),
 *   nodeOf(key) -> [keys] (the wires predicted to be one node with 'TILE/WIRE': reserved with it),
 *   maxDepth (PIPs from the slice output to the tested wire, default 3).
 * Returns { designs: [{ xdl, tests: [{ net, join }] }], untestable: [join] }.
 */
export function joinTestDesigns(opts) {
  const { part, joins, slicesOf, pinWire, pipsOf, nodeOf = k => [k], maxDepth = 3 } = opts;
  const outOf = new Map();   // tile -> Map from -> [to]
  const adj = tile => {
    if (!outOf.has(tile)) {
      const m = new Map();
      for (const [f, t] of pipsOf(tile)) { if (!m.has(f)) m.set(f, []); m.get(f).push(t); }
      outOf.set(tile, m);
    }
    return outOf.get(tile);
  };
  let left = joins.slice();
  const designs = [], untestable = [];
  while (left.length) {
    const used = new Set(), usedSrc = new Set();
    const tests = [], next = [];
    const reserve = keys => keys.forEach(k => nodeOf(k).forEach(x => used.add(x)));
    const free = k => nodeOf(k).every(x => !used.has(x));
    for (const join of left) {
      let plan = null, possible = false;
      for (const [d, l] of [[join[0], join[1]], [join[1], join[0]]]) {
        const [tD, wD] = splitKey(d), [tL, wL] = splitKey(l);
        const outs = adj(tL).get(wL);
        if (!outs || !slicesOf(tD).length) continue;
        // a path in tD from a slice output to wD (breadth first over the tile's own PIPs)
        const srcs = [];
        for (const s of slicesOf(tD)) for (const [o, i] of SOURCES) srcs.push({ s, o, i, w: pinWire(s.pos, o) });
        const target = wD;
        // breadth first from w over the tile's PIPs (only through free wires when `onlyFree`)
        const search = (w0, onlyFree) => {
          const prev = new Map([[w0, null]]);
          let frontier = [w0];
          for (let depth = 0; depth < maxDepth && !prev.has(target); depth++) {
            const nf = [];
            for (const w of frontier) for (const t of adj(tD).get(w) || []) {
              if (prev.has(t)) continue;
              if (onlyFree && t !== target && !free(`${tD}/${t}`)) continue;
              prev.set(t, w); nf.push(t);
            }
            frontier = nf;
          }
          if (!prev.has(target)) return null;
          const wires = [];
          for (let w = target; w !== null; w = prev.get(w)) wires.unshift(w);
          return wires;
        };
        let path = null;
        for (const src of srcs) {
          if (!search(src.w, false)) continue;
          possible = true;
          if (usedSrc.has(`${src.s.site}.${src.o}`)) continue;
          const wires = search(src.w, true);
          if (wires) { path = { src, wires }; break; }
        }
        if (!path) continue;
        const wC = outs.find(t => free(`${tL}/${t}`));
        if (!wC) continue;
        const keys = [...path.wires.map(w => `${tD}/${w}`), `${tL}/${wL}`, `${tL}/${wC}`];
        if (!keys.every(free)) continue;
        plan = { tD, tL, wL, wC, path, keys };
        break;
      }
      if (!plan) { (possible ? next : untestable).push(join); continue; }
      reserve(plan.keys);
      usedSrc.add(`${plan.path.src.s.site}.${plan.path.src.o}`);
      tests.push({ net: `h${tests.length}`, join, plan });
    }
    if (!tests.length) { untestable.push(...next); break; }
    designs.push({ xdl: testXdl(part, tests), tests: tests.map(t => ({ net: t.net, join: t.join })) });
    left = next;
  }
  return { designs, untestable };
}

// Only the LUTs of the outputs used are set: a LUT whose input is not connected is a DRC error,
// and xdl -xdl2ncd spends about 30 ms on each error it reports.
function testXdl(part, tests) {
  const lines = [`design "joins" ${part} v3.2 ;`];
  const sites = new Map();
  for (const t of tests) { const s = t.plan.path.src; if (!sites.has(s.s.site)) sites.set(s.s.site, new Set()); sites.get(s.s.site).add(s.o); }
  for (const [site, outs] of sites) {
    const n = `s_${site}`;
    const f = outs.has('X') ? ` F:${n}_f:#LUT:D=A1 FXMUX::F XUSED::0` : '';
    const g = outs.has('Y') ? ` G:${n}_g:#LUT:D=A1 GYMUX::G YUSED::0` : '';
    lines.push(`inst "${n}" "SLICEL", placed TILE ${site} ,`, `  cfg "${f}${g} " ;`);
  }
  for (const t of tests) {
    const { src, wires } = t.plan.path, n = `s_${src.s.site}`;
    lines.push(`net "${t.net}" ,`, `  outpin "${n}" ${src.o} ,`, `  inpin "${n}" ${src.i} ,`);
    for (let i = 1; i < wires.length; i++) lines.push(`  pip ${t.plan.tD} ${wires[i - 1]} -> ${wires[i]} ,`);
    lines.push(`  pip ${t.plan.tL} ${t.plan.wL} -> ${t.plan.wC} ,`, '  ;');
  }
  return lines.join('\n') + '\n';
}

/**
 * The verdicts of a test design from the DRC report (drc -z) or the log of xdl -xdl2ncd -force:
 * Map net -> 'join' (no island) | 'no-join' (island). A routing conflict (PhysDesignRules 1712 /
 * 1713: two test nets on one node, when the nodes predicted to keep them apart were incomplete)
 * does not change the verdict: an island is a PIP cut off from the net's own source, whoever drives
 * its wire (41 479 tests, 15 836 of them with a conflict: all agreed with the shipped graph).
 * Nets the report names for anything else are 'unclear'.
 */
export function parseJoinTests(log, nets) {
  const text = log.replace(/\n\s+/g, ' ');
  const island = new Set(), other = new Set();
  const expected = /^(has an antenna|is only partially routed|is not completely routed|has a routing conflict with)/;
  for (const m of text.matchAll(/network <([^>]+)> ([^.]*)/g)) {
    if (/^has island/.test(m[2])) island.add(m[1]);
    else if (!expected.test(m[2])) other.add(m[1]);
  }
  const out = new Map();
  for (const n of nets) out.set(n, other.has(n) ? 'unclear' : island.has(n) ? 'no-join' : 'join');
  return out;
}
