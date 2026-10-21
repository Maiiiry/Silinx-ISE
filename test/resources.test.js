// The device resources model (core/resources.js, #790): its counts against Xilinx's data sheets (an
// independent copy of their tables, below), against the device reports of the shipped devices and ISE's
// MAP report of the Spartan-6 parts, and its primitives against core/unisim.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resourcesOf, resourceCount, familyResources, primitivesOf, resourceOfPrimitive, RESOURCE_FAMILIES } from '../core/resources.js';
import { findPart, partsOfFamily, PARTS } from '../server/devices.js';
import { UNISIM_SOURCE } from '../core/unisim.js';

// DS312 v4.2 Table 1 (slices, distributed RAM Kb, block RAMs, multipliers, DCMs, max user I/O) and Table 2
// (user I/O per package); 24 BUFGMUX on every part
const DS312 = {
  xc3s100e: [960, 15, 4, 4, 2, 108, { vq100: 66, cp132: 83, tq144: 108 }],
  xc3s250e: [2448, 38, 12, 12, 4, 172, { vq100: 66, cp132: 92, tq144: 108, pq208: 158, ft256: 172 }],
  xc3s500e: [4656, 73, 20, 20, 4, 232, { vq100: 66, cp132: 92, pq208: 158, ft256: 190, fg320: 232 }],
  xc3s1200e: [8672, 136, 28, 28, 8, 304, { ft256: 190, fg320: 250, fg400: 304 }],
  xc3s1600e: [14752, 231, 36, 36, 8, 376, { fg320: 250, fg400: 304, fg484: 376 }],
};
// DS160 v2.0 Table 1 (slices, flip-flops, distributed RAM Kb, DSP48A1, 18 Kb block RAMs, CMTs, MCBs, max
// user I/O) and Table 2 (user I/O per package)
const DS160 = {
  xc6slx4: [600, 4800, 75, 8, 12, 2, 0, 132, { tqg144: 102, cpg196: 106, csg225: 132 }],
  xc6slx9: [1430, 11440, 90, 16, 32, 2, 2, 200, { tqg144: 102, cpg196: 106, csg225: 160, ftg256: 186, csg324: 200 }],
  xc6slx16: [2278, 18224, 136, 32, 32, 2, 2, 232, { cpg196: 106, csg225: 160, ftg256: 186, csg324: 232 }],
  xc6slx25: [3758, 30064, 229, 38, 52, 2, 2, 266, { ftg256: 186, csg324: 226, fgg484: 266 }],
  xc6slx45: [6822, 54576, 401, 58, 116, 4, 2, 358, { csg324: 218, csg484: 320, fgg484: 316, fgg676: 358 }],
  xc6slx75: [11662, 93296, 692, 132, 172, 6, 4, 408, { csg484: 328, fgg484: 280, fgg676: 408 }],
  xc6slx25t: [3758, 30064, 229, 38, 52, 2, 2, 250, { csg324: 190, fgg484: 250 }],
  xc6slx45t: [6822, 54576, 401, 58, 116, 4, 2, 296, { csg324: 190, csg484: 296, fgg484: 296 }],
  xc6slx75t: [11662, 93296, 692, 132, 172, 6, 4, 348, { csg484: 292, fgg484: 268, fgg676: 348 }],
};

const counts = (part, pkg) => Object.fromEntries(resourcesOf(findPart(part), pkg).map(r => [r.id, r.count]));

test('Spartan-3E: every part\'s resources as DS312 gives them, the I/O of every package', () => {
  assert.deepEqual(partsOfFamily('spartan3e').map(p => p.part), Object.keys(DS312));
  for (const [part, [slices, distKb, brams, mults, dcms, maxIo, pkgs]] of Object.entries(DS312)) {
    assert.deepEqual(counts(part), { ffs: 2 * slices, luts: 2 * slices, slices, distRam: distKb * 1024, iob: maxIo,
      ramb16: brams, mult18x18: mults, bufgmux: 24, dcm: dcms }, part);
    assert.equal(Math.round((slices * 16) / 1024), distKb, `${part}: half the slices (SLICEM) with two 16-bit LUT RAMs (DS312 rounds to the Kb)`);
    for (const [pkg, io] of Object.entries(pkgs)) assert.equal(resourceCount(findPart(part), 'iob', pkg), io, `${part} ${pkg}`);
    assert.deepEqual(Object.keys(findPart(part).packages).sort(), Object.keys(pkgs).sort(), part);
  }
});

test('Spartan-6: every part\'s resources as DS160 gives them (a CMT 2 DCM + 1 PLL, an 18 Kb block two RAMB8BWER), the I/O of every package', () => {
  assert.deepEqual(partsOfFamily('spartan6').map(p => p.part), Object.keys(DS160));
  for (const [part, [slices, ffs, distKb, dsp, brams, cmts, mcb, maxIo, pkgs]] of Object.entries(DS160)) {
    assert.deepEqual(counts(part), { ffs, luts: 4 * slices, slices, distRam: distKb * 1024, iob: maxIo,
      ramb16bwer: brams, ramb8bwer: 2 * brams, dsp48a1: dsp, bufgmux: 16, bufio2: 32,
      bufh: { xc6slx16: 128, xc6slx45: 256 }[part] ?? null, dcm: 2 * cmts, pll: cmts, mcb }, part);
    assert.equal(ffs, 8 * slices, part);
    for (const [pkg, io] of Object.entries(pkgs)) assert.equal(resourceCount(findPart(part), 'iob', pkg), io, `${part} ${pkg}`);
    assert.deepEqual(Object.keys(findPart(part).packages).sort(), Object.keys(pkgs).sort(), part);
  }
});

test('the Silinx toolchain\'s devices: the sites of each shipped device report equal to the model\'s counts', async () => {
  const { loadDeviceCache, SHIPPED_DEVICES_DIR } = await import('../core/fpga/device-node.js');
  const { deviceSites } = await import('../core/fpga/place.js');
  const shipped = fs.readdirSync(SHIPPED_DEVICES_DIR).filter(f => f.endsWith('.json.gz')).map(f => f.replace(/\.json\.gz$/, ''));
  assert.deepEqual(shipped.sort(), ['xc3s100ecp132-4', 'xc3s1200efg320-4', 'xc3s250ecp132-4', 'xc3s500efg320-4']);
  for (const name of shipped) {
    const [, part, pkg] = /^(xc3s\d+e)([a-z]+\d+)-\d$/.exec(name);
    const d = deviceSites(loadDeviceCache(name)), c = counts(part, pkg);
    assert.deepEqual({ slices: d.slices.size, iob: d.pads.size, bufgmux: d.bufgmux.length, ramb16: d.brams.length, mult18x18: d.mults.length, dcm: d.dcms.length },
      { slices: c.slices, iob: c.iob, bufgmux: c.bufgmux, ramb16: c.ramb16, mult18x18: c.mult18x18, dcm: c.dcm }, name);
  }
});

test('Spartan-6: the totals of ISE\'s MAP report of the LX16 and the LX45 (research/s6/measured) equal to the model\'s, line by line', () => {
  const night1 = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../research/s6/measured/night1.json', import.meta.url)), 'utf8'));
  for (const [key, part, pkg] of [['xc6slx16-csg324-3', 'xc6slx16', 'csg324'], ['xc6slx45-csg324-3', 'xc6slx45', 'csg324']]) {
    // every MAP line with a total, of every example built on the part (ISE's and the open synthesis's netlist)
    const totals = {};
    for (const b of Object.values(night1.boards).filter(x => x.part === key)) {
      for (const ex of Object.values(b.examples)) {
        for (const flow of [ex.hdl, ex.open]) for (const [k, v] of Object.entries(flow?.map || {})) if (v?.of != null) totals[`Number of ${k}`] = v.of;
      }
    }
    const model = resourcesOf(findPart(part), pkg).filter(r => r.report);
    const seen = model.filter(r => r.report in totals);
    assert.ok(seen.length >= 11, `${part}: ${seen.map(r => r.report)} of ${Object.keys(totals)}`);
    for (const r of seen) assert.equal(r.count, totals[r.report], `${part}: ${r.report}`);
    assert.deepEqual(model.filter(r => !(r.report in totals)).map(r => r.id), [], part);
  }
});

const unisimNames = [...new Set([...UNISIM_SOURCE.text.matchAll(/^entity\s+(\w+)\s+is\b/gim)].map(m => m[1].toUpperCase()))];

test('primitives: every UNISIM primitive of a counted resource (block RAM, multiplier, DSP, DCM / PLL, clock buffer) mapped to it', () => {
  const counted = unisimNames.filter(n => /^(RAMB|MULT18X18|DSP48|DCM|PLL|BUFG|BUFIO2|BUFH|MCB)/.test(n));
  assert.equal(counted.length, 27 + 3 + 1 + 2 + 6 + 2, counted.join(' '));
  for (const n of counted) assert.ok(RESOURCE_FAMILIES.some(f => resourceOfPrimitive(f, n)), n);
  // the families' own
  const s3e = n => resourceOfPrimitive('spartan3e', n), s6 = n => resourceOfPrimitive('spartan6', n);
  for (const n of counted.filter(x => /^RAMB16_S/.test(x))) { assert.equal(s3e(n), 'ramb16', n); assert.equal(s6(n), null, n); }
  assert.deepEqual(['RAMB16_S9_S9', 'MULT18X18SIO', 'DCM_SP', 'BUFGMUX', 'BUFG', 'DSP48A1', 'RAMB8BWER'].map(s3e), ['ramb16', 'mult18x18', 'dcm', 'bufgmux', 'bufgmux', null, null]);
  assert.deepEqual(['RAMB16BWER', 'RAMB8BWER', 'DSP48A1', 'DCM_SP', 'PLL_BASE', 'BUFG', 'BUFIO2', 'BUFH', 'MCB', 'MULT18X18SIO'].map(s6),
    ['ramb16bwer', 'ramb8bwer', 'dsp48a1', 'dcm', 'pll', 'bufgmux', 'bufio2', 'bufh', 'mcb', null]);
  // the common ones: LUT4 on both, LUT6 on the Spartan-6 only; flip-flops, distributed RAM, I/O
  assert.deepEqual(['LUT4', 'LUT6', 'FDCE', 'RAM16X1S', 'SRLC32E', 'IBUF', 'OBUFT'].map(s3e), ['luts', null, 'ffs', 'distRam', null, 'iob', 'iob']);
  assert.deepEqual(['LUT4', 'LUT6_D', 'FDCE', 'RAM64M', 'SRLC32E', 'IOBUF'].map(s6), ['luts', 'luts', 'ffs', 'distRam', 'distRam', 'iob']);
  assert.equal(resourceOfPrimitive('spartan3e', 'ramb16_s36_s36'), 'ramb16', 'any case');
  // a primitive using no counted resource, an unknown name
  for (const n of ['MUXCY', 'XORCY', 'CARRY4', 'GND', 'VCC', 'NOPE', '', null]) assert.equal(s6(n), null, String(n));
});

test('primitivesOf: each family\'s primitives once, in the resources\' order; every UNISIM model of the family\'s among them', () => {
  for (const f of RESOURCE_FAMILIES) {
    const list = primitivesOf(f), names = list.map(p => p.name);
    assert.equal(new Set(names).size, names.length, f);
    const order = familyResources(f).map(r => r.id);
    assert.deepEqual([...new Set(list.map(p => p.resource))], order.filter(id => familyResources(f).find(r => r.id === id).primitives.length), f);
    for (const p of list) assert.equal(resourceOfPrimitive(f, p.name), p.resource, `${f} ${p.name}`);
  }
  assert.equal(primitivesOf('spartan3e').filter(p => p.resource === 'ramb16').length, 27);
  assert.deepEqual(primitivesOf('spartan6').filter(p => p.resource === 'pll').map(p => p.name), ['PLL_BASE', 'PLL_ADV']);
  // the simulated ones: every UNISIM entity of a Spartan-6 resource is a Spartan-6 primitive
  for (const n of ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1', 'DCM_SP', 'BUFG', 'BUFGMUX']) assert.ok(unisimNames.includes(n) && primitivesOf('spartan6').some(p => p.name === n), n);
});

test('familyResources: ids, labels in English and Portuguese, the MAP report\'s lines; copies, not the model itself', () => {
  assert.deepEqual(familyResources('spartan3e').map(r => r.id), ['ffs', 'luts', 'slices', 'distRam', 'iob', 'ramb16', 'mult18x18', 'bufgmux', 'dcm']);
  assert.deepEqual(familyResources('spartan6').map(r => r.id), ['ffs', 'luts', 'slices', 'distRam', 'iob', 'ramb16bwer', 'ramb8bwer', 'dsp48a1', 'bufgmux', 'bufio2', 'bufh', 'dcm', 'pll', 'mcb']);
  for (const f of [...RESOURCE_FAMILIES, 'spartan3', 'artix7']) {
    for (const r of familyResources(f)) {
      assert.ok(r.label.en && r.label.pt, `${f} ${r.id}`);
      assert.ok(r.report === null || /^Number of /.test(r.report), `${f} ${r.id}`);
      assert.equal('count' in r, false);
    }
  }
  assert.deepEqual(familyResources('spartan3e').find(r => r.id === 'luts').label, { en: '4-input LUTs', pt: 'LUTs de 4 entradas' });
  assert.deepEqual(familyResources('spartan6').find(r => r.id === 'ramb8bwer').shares, { with: 'ramb16bwer', per: 2 });
  assert.equal(familyResources('spartan6').find(r => r.id === 'bufgmux').report, 'Number of BUFG/BUFGMUXs');
  const a = familyResources('spartan3e');
  a[5].primitives.length = 0; a[5].label = null;
  assert.equal(familyResources('spartan3e')[5].primitives.length, 27, 'a caller\'s change does not reach the model');
  assert.ok(familyResources('spartan3e')[5].label.en);
});

test('other families: the common resources only; unknown or missing data null', () => {
  assert.deepEqual(familyResources('spartan3').map(r => r.id), ['ffs', 'luts', 'slices', 'distRam', 'iob']);
  assert.equal(familyResources('spartan3')[1].label.en, '4-input LUTs');
  assert.equal(familyResources('kintex7')[1].label.en, '6-input LUTs');
  assert.deepEqual(familyResources(undefined).map(r => r.id), ['ffs', 'luts', 'slices', 'distRam', 'iob']);
  assert.deepEqual(counts('xc3s200', 'ft256'), { ffs: 3840, luts: 3840, slices: 1920, distRam: 30 * 1024, iob: 173 });
  assert.equal(counts('xc7z010').distRam, null, 'DS190 lists no distributed RAM: not known');
  assert.deepEqual(primitivesOf('virtex5').map(p => p.resource).filter(x => !['ffs', 'luts', 'distRam', 'iob'].includes(x)), []);
  // every part of the database has its common resources
  for (const p of PARTS) for (const r of resourcesOf(p).filter(x => ['ffs', 'luts', 'slices', 'iob'].includes(x.id))) assert.ok(r.count > 0, `${p.part} ${r.id}`);
});

test('resourceCount: a resource the part lacks is 0, an unknown package or count null, an unknown id or a missing part an error', () => {
  const lx4 = findPart('xc6slx4'), s3e = findPart('xc3s250e');
  assert.equal(resourceCount(lx4, 'mcb'), 0, 'the LX4 has no memory controller');
  assert.equal(resourceCount(lx4, 'ramb8bwer'), 24);
  assert.equal(resourceCount(s3e, 'ramb16bwer'), 0, 'a Spartan-6 resource on a Spartan-3E');
  assert.equal(resourceCount(s3e, 'pll'), 0);
  assert.equal(resourceCount(lx4, 'mult18x18'), 0);
  assert.equal(resourceCount(s3e, 'bufgmux'), 24);
  assert.equal(resourceCount(lx4, 'bufgmux'), 16);
  assert.equal(resourceCount(lx4, 'bufh'), null, 'not known yet');
  assert.equal(resourceCount(s3e, 'iob'), 172, 'no package: the maximum');
  assert.equal(resourceCount(s3e, 'iob', 'CP132'), 92, 'any case');
  assert.equal(resourceCount(s3e, 'iob', 'fg484'), null, 'a package the part is not made in');
  assert.equal(resourcesOf(s3e, 'fg484').find(r => r.id === 'iob').count, null);
  assert.throws(() => resourceCount(s3e, 'unicorns'), /unknown resource 'unicorns'/);
  assert.throws(() => resourceCount(s3e, undefined), RangeError);
  for (const bad of [null, undefined, 'xc3s250e', {}, 42]) {
    assert.throws(() => resourcesOf(bad), TypeError, String(bad));
    assert.throws(() => resourceCount(bad, 'luts'), /a part record is needed/);
  }
  // the page's records (S.devices.parts) are the same records sent as JSON
  const viaJson = JSON.parse(JSON.stringify(s3e));
  assert.deepEqual(resourcesOf(viaJson, 'cp132'), resourcesOf(s3e, 'cp132'));
});
