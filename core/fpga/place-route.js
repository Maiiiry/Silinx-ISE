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
//   replicate register replication (replicate.js, #4): the flip-flops of many loads on the critical
//             path copied, the design packed, placed and routed again (same seed), the faster kept
//
//   const pr = placeRoute(packed, device, known, { seed })                    // one placement
//   const best = placeRouteBest(netlist, packed, device, known, { seed, tries, replicate, pack })
// device: the routing graph (device-node.js loadDeviceCache); known: bitgen.js knownRouting(db).
// Each flow keeps its own messages: onPlaced(placement, info) after each placement, onRouted(pr,
// info) after each routing, onReplication(r) once replication was tried (info: { seed, try,
// replication: { flipFlops, copies } or null }).
import { deviceSites, place, placedXdl } from './place.js';
import { routeDesign, clockReach, bufgReach } from './route.js';
import { analyzeTiming, delayTable } from './timing.js';
import { pack } from './pack.js';
import { replicationPlan, replicateFlipFlops, REPLICATE_MAX_SLICES } from './replicate.js';
import { parseXdl, writeXdl } from '../xdl.js';

/**
 * One placement and its routing: { packed, placement, placedText, routed, sta (null when not
 * completely routed), period (Infinity then), seed, placeMs, routeMs }. Options: seed, effort,
 * timing (the placer's timing weight; its default when null), timingRoute (the timing-driven
 * router, default true), delays (timing.js delayTable; computed, and cached on the device, when
 * not given), onPlaced, onRouted, info (passed to them). Throws the placer's errors (PlaceError).
 */
export function placeRoute(packed, device, known, { seed = 1, effort = 1, timing = null, timingRoute = true, delays = null, onPlaced = null, onRouted = null, info = {} } = {}) {
  const t0 = Date.now();
  const allowPip = known.allowPip;
  const placement = place(packed, deviceSites(device, known), {
    seed, effort, ...(timing !== null && { timing }), delays: delays || delayTable(device, { allowPip }),
    clockSites: site => clockReach(device, site, allowPip), bufgSites: (site, pin, to) => bufgReach(device, site, pin, allowPip, to),
  });
  const placedText = writeXdl(placedXdl(packed, placement));
  const placeMs = Date.now() - t0;
  const nfo = { seed, try: 0, replication: null, ...info };
  onPlaced?.(placement, { ...nfo, placeMs });
  const t1 = Date.now();
  const routed = routeDesign(parseXdl(placedText), device, { ...known, timing: timingRoute });
  const routeMs = Date.now() - t1;
  // (complete: no error, no net left unrouted, no node still shared when the router stopped, #242)
  const sta = routed.errors.length || routed.failed.length || routed.overused ? null : analyzeTiming(parseXdl(writeXdl(routed.design)), device);
  const pr = { packed, placement, placedText, routed, sta, period: sta ? sta.period : Infinity, seed, placeMs, routeMs };
  onRouted?.(pr, nfo);
  return pr;
}

/**
 * The flow's place and route: `tries` placements from `seed` on (the fastest kept), then register
 * replication when `replicate` (default true) and the design is completely routed and has at most
 * REPLICATE_MAX_SLICES slices. netlist: the netlist `packed` was packed from (netlist.js
 * readYosysJson); pack: the options to pack the replicated netlist with (pack.js: ucf, part,
 * carryOut). replicateOpts: replicate.js REPLICATION overrides. Returns the kept result (as
 * placeRoute's) with first (the first placement's result) and replication: null when not tried
 * (or nothing to copy), else { flipFlops, copies, plan, result (null when it failed), error, kept,
 * before (the period without it) }.
 */
export function placeRouteBest(netlist, packed, device, known, { seed = 1, tries = 1, replicate = true, replicateOpts = {}, pack: packOptions = {}, onReplication = null, ...options } = {}) {
  const delays = options.delays || delayTable(device, { allowPip: known.allowPip });
  const opts = { ...options, delays };
  let best = null, first = null;
  for (let k = 0; k < Math.max(1, tries); k++) {
    const pr = placeRoute(packed, device, known, { ...opts, seed: seed + k, info: { try: k } });
    first ||= pr;
    if (!best || pr.period < best.period) best = pr;
  }
  let replication = null;
  if (replicate && best.sta && packed.stats.slices <= REPLICATE_MAX_SLICES) {
    const plan = replicationPlan(netlist, best.packed, best.placement, best.sta, replicateOpts);
    if (plan.length) {
      const copies = plan.reduce((a, p) => a + p.groups.length - 1, 0);
      let result = null, error = null;
      try {
        result = placeRoute(pack(replicateFlipFlops(netlist, plan), packOptions), device, known,
          { ...opts, seed: best.seed, info: { try: 0, replication: { flipFlops: plan.length, copies } } });
      } catch (e) { error = e; }
      const kept = !!result?.sta && result.period < best.period;
      replication = { flipFlops: plan.length, copies, plan, result, error, kept, before: best.period };
      onReplication?.(replication);
      if (kept) best = result;
    }
  }
  return { ...best, first, replication };
}
