// Silinx - place and route (browser + Node): the one place-and-route step of the Silinx toolchain,
// shared by its flows (the app's, server/open-flow-run.js; research/s3e-route/open-flow.mjs; the
// design corpus's, test/designs-corpus/run.mjs: #79, #88), so that they all place and route a
// design alike:
//   place     on the device's sites (the global buffers of known settings only), with the delays of
//             the fastest routes on switches of known bits (timing.js delayTable), each clock's
//             flip-flops on the slices its global line reaches (route.js clockReach), a DCM's
//             outputs on the global buffers their dedicated paths reach (route.js bufgReach)
//   route     on the PIPs of known bits, timing-driven
//   STA       of the routed design (timing.js analyzeTiming), when it is completely routed
//   tries     N placements (seeds seed .. seed + N - 1), each routed; the fastest kept
//   replicate register replication (replicate.js, #4): the flip-flops and LUTs of many loads on the
//             critical path copied (#522), the design packed, placed again from the first placement
//             (same seed, #87) and routed, the faster kept
//
//   const pr = placeRoute(packed, device, known, { seed })                    // one placement
//   const best = placeRouteBest(netlist, packed, device, known, { seed, tries, replicate, pack })
// device: the routing graph (device-node.js loadDeviceCache); known: bitgen.js knownRouting(db).
// Each flow keeps its own messages: onPlaced(placement, info) after each placement, onRouted(pr,
// info) after each routing, onReplication(r) once replication was tried (info: { seed, try,
// replication: { flipFlops, luts, copies } or null }).
import { deviceSites, place, placedXdl } from './place.js';
import { routeDesign, clockReach, bufgReach } from './route.js';
import { analyzeTiming, delayTable } from './timing.js';
import { pack } from './pack.js';
import { replicationPlan, replicateCells, warmStart, REPLICATE_MAX_SLICES, WARM } from './replicate.js';
import { parseXdl, writeXdl } from '../xdl.js';

/**
 * One placement and its routing: { packed, placement, placedText, routed, sta (null when not
 * completely routed), period (Infinity then), seed, placeMs, routeMs }. Options: seed, effort,
 * timing (the placer's timing weight; its default when null), timingRoute (the timing-driven
 * router, default true), delays (timing.js delayTable; computed, and cached on the device, when
 * not given), routeIterations (the router's passes at most; its default when null), onPlaced,
 * onRouted, info (passed to them). Throws the placer's errors (PlaceError).
 */
export function placeRoute(packed, device, known, { seed = 1, effort = 1, timing = null, timingRoute = true, delays = null, routeIterations = null, start = null, onPlaced = null, onRouted = null, info = {} } = {}) {
  const t0 = Date.now();
  const allowPip = known.allowPip;
  const placement = place(packed, deviceSites(device, known), {
    seed, effort, ...(timing !== null && { timing }), delays: delays || delayTable(device, { allowPip }), start,
    clockSites: site => clockReach(device, site, allowPip), bufgSites: (site, pin, to) => bufgReach(device, site, pin, allowPip, to),
  });
  const placedText = writeXdl(placedXdl(packed, placement));
  const placeMs = Date.now() - t0;
  const nfo = { seed, try: 0, replication: null, ...info };
  onPlaced?.(placement, { ...nfo, placeMs });
  const t1 = Date.now();
  const routed = routeDesign(parseXdl(placedText), device, { ...known, timing: timingRoute, ...(routeIterations && { maxIterations: routeIterations }) });
  const routeMs = Date.now() - t1;
  // (complete: no error, no net left unrouted, no node still shared when the router stopped, #242)
  const sta = routed.errors.length || routed.failed.length || routed.overused ? null : analyzeTiming(parseXdl(writeXdl(routed.design)), device);
  const pr = { packed, placement, placedText, routed, sta, period: sta ? sta.period : Infinity, seed, placeMs, routeMs };
  onRouted?.(pr, nfo);
  return pr;
}

// the placements made more when none routes completely for nodes left shared (#249)
export const RETRY_SEEDS = 3;

/**
 * The flow's place and route: `tries` placements from `seed` on (the fastest kept; when none routes
 * completely only because the router left nodes shared, up to `retries` more seeds, #249), then register
 * replication when `replicate` (default true) and the design is completely routed and has at most
 * REPLICATE_MAX_SLICES slices. netlist: the netlist `packed` was packed from (netlist.js
 * readYosysJson); pack: the options to pack the replicated netlist with (pack.js: ucf, part,
 * carryOut). replicateOpts: replicate.js REPLICATION overrides. Returns the kept result (as
 * placeRoute's) with first (the first placement's result) and replication: null when not tried
 * (or nothing to copy), else { flipFlops, luts (the cells copied), copies, plan, result (null when it failed), error, kept,
 * before (the period without it) }, and retried: the placements made more (#249). placeRouteFn: placeRoute
 * (for the tests).
 */
export function placeRouteBest(netlist, packed, device, known, { seed = 1, tries = 1, retries = RETRY_SEEDS, replicate = true, replicateOpts = {}, pack: packOptions = {}, onReplication = null, placeRouteFn = placeRoute, ...options } = {}) {
  const delays = options.delays || delayTable(device, { allowPip: known.allowPip });
  const opts = { ...options, delays };
  let best = null, first = null;
  const n = Math.max(1, tries);
  for (let k = 0; k < n; k++) {
    const pr = placeRouteFn(packed, device, known, { ...opts, seed: seed + k, info: { try: k } });
    first ||= pr;
    if (!best || pr.period < best.period) best = pr;
  }
  // no placement routed completely, only nodes left shared (the router stopped without a legal
  // routing: a dense design on an unlucky placement, #249): the next seeds, a few more
  let retried = 0;
  const stuck = r => !r.sta && r.routed.overused > 0 && !r.routed.errors.length && !r.routed.failed.length;
  while (stuck(best) && retried < retries) {
    const pr = placeRouteFn(packed, device, known, { ...opts, seed: seed + n + retried, info: { try: n + retried, retry: true } });
    retried++;
    if (pr.period < best.period) best = pr;
  }
  let replication = null;
  if (replicate && best.sta && packed.stats.slices <= REPLICATE_MAX_SLICES) {
    const plan = replicationPlan(netlist, best.packed, best.placement, best.sta, replicateOpts);
    if (plan.length) {
      const copies = plan.reduce((a, p) => a + p.groups.length - 1, 0);
      const flipFlops = plan.filter(p => /^FD/.test(netlist.cells[p.cell].type)).length, luts = plan.length - flipFlops;
      let result = null, error = null;
      try {
        const nl2 = replicateCells(netlist, plan), packed2 = pack(nl2, packOptions);
        // (placed from the first placement, #87: the copies near their loads)
        const start = WARM.on && best.placement ? { ...WARM, at: warmStart(netlist, best.packed, best.placement, nl2, packed2) } : null;
        result = placeRouteFn(packed2, device, known,
          { ...opts, seed: best.seed, start, info: { try: 0, replication: { flipFlops, luts, copies } } });
      } catch (e) { error = e; }
      const kept = !!result?.sta && result.period < best.period;
      replication = { flipFlops, luts, copies, plan, result, error, kept, before: best.period };
      onReplication?.(replication);
      if (kept) best = result;
    }
  }
  return { ...best, first, replication, retried };
}
