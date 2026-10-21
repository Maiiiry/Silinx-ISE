// Silinx - a design's use of the device's resources against what the device has (#795, #796; part of #787):
// the resources a design's cells or primitives use (core/resources.js: each UNISIM primitive's resource) and
// the ones it needs more of than the part has, with the message that names them ("14 block RAMs needed, the
// XC3S100E has 4"). Read by the Silinx toolchain's synthesis and MAP (core/open-flow-core.js) and by the
// check of a change of the target device (#796).
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   usedOfPrimitives(family, counts)  the resources the primitives use: { TYPE: n } -> { resourceId: n }
//   overResources(resources, used)    the resources used over their count: [{ id, used, count, noun, report }]
//   overMessage(over, device)         one of them as a message: '14 block RAMs needed, the XC3S100E has 4'
//   resourceNoun(id)                  a resource's name in a message ('block RAMs')
import { resourceOfPrimitive } from './resources.js';

// a resource's name in a message, plural (English; the console's messages are ISE's language)
const NOUNS = {
  ffs: 'flip-flops', luts: 'LUTs', slices: 'slices', distRam: 'bits of distributed RAM', iob: 'I/O pads',
  ramb16: 'block RAMs', ramb16bwer: 'block RAMs', ramb8bwer: 'block RAM halves (RAMB8BWER)', mult18x18: 'multipliers', dsp48a1: 'DSP slices',
  bufgmux: 'global clock buffers', bufio2: 'I/O clock buffers', bufh: 'horizontal clock buffers', dcm: 'DCMs', pll: 'PLLs', mcb: 'memory controllers',
};

/** A resource's name in a message, plural ('block RAMs'); an id not known here, itself. */
export const resourceNoun = id => NOUNS[id] || id;

/** The resources the primitives of a family use: counts { TYPE: n } (a netlist's cells by type, a design's
 *  instances by primitive name, any case) -> { resourceId: n }; a primitive of no counted resource left out. */
export function usedOfPrimitives(family, counts) {
  const used = {};
  for (const [type, n] of Object.entries(counts || {})) {
    const id = resourceOfPrimitive(family, type);
    if (id && n > 0) used[id] = (used[id] || 0) + n;
  }
  return used;
}

/**
 * The resources a design uses more of than the part has: resources, core/resources.js resourcesOf(part, pkg)
 * (or the same entries with counts of the device's own, the MAP's sites); used, { resourceId: n }. A resource
 * of unknown count (null) is not checked. A resource sharing another's sites (Spartan-6's RAMB8BWER, half a
 * RAMB16BWER's) counts in the other's: two halves are one block RAM, and the check is the other's.
 * [{ id, used, count, noun, report }] in the resources' order.
 */
export function overResources(resources, used) {
  const need = { ...used };
  for (const r of resources) {
    if (r.shares && need[r.id]) need[r.shares.with] = (need[r.shares.with] || 0) + Math.ceil(need[r.id] / r.shares.per);
  }
  return resources.filter(r => !r.shares && r.count != null && (need[r.id] || 0) > r.count)
    .map(r => ({ id: r.id, used: need[r.id], count: r.count, noun: resourceNoun(r.id), report: r.report }));
}

/** An overflow as a message: '14 block RAMs needed, the XC3S100E has 4' (device: the part's name, any case). */
export function overMessage(o, device) {
  return `${o.used} ${o.noun} needed, the ${String(device).toUpperCase()} has ${o.count}`;
}
