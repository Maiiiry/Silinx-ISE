// The device description shipped with Silinx (core/fpga/devices/) and the whole open flow on it:
// blinky (examples/blinky, Basys2-250) synthesized, packed, placed, routed and written as a .bit
// with no Xilinx tool (research/s3e-route/open-flow.mjs). That the .bit equals ISE's needs ISE:
// npm run check:open-flow (see README, For developers).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-open-flow-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');   // no user cache: the shipped graph is used
const { findDeviceGraph, shippedDevicePath, deviceCachePath, loadDeviceCache } = await import('../core/fpga/device-node.js');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the routing graph of the XC3S250E-CP132 ships with Silinx; the user\'s own one comes first; any speed grade', () => {
  const shipped = shippedDevicePath('xc3s250ecp132-4');
  assert.ok(fs.existsSync(shipped));
  assert.equal(findDeviceGraph('xc3s250ecp132-4'), shipped);
  assert.equal(findDeviceGraph('xc3s250ecp132-5'), shipped);
  assert.equal(findDeviceGraph('xc3s1600efg320-4'), null);
  assert.throws(() => loadDeviceCache('xc3s1600efg320-4'), /no routing graph of xc3s1600efg320-4: build it from your ISE's device report/);
  const dev = loadDeviceCache('xc3s250ecp132-4');
  assert.equal(dev.part.replace(/-\d+$/, ''), 'xc3s250ecp132');
  assert.ok(dev.nodeCount > 100000);
  // a graph the user built (from their own ISE) takes precedence
  fs.mkdirSync(path.dirname(deviceCachePath('xc3s250ecp132-4')), { recursive: true });
  fs.writeFileSync(deviceCachePath('xc3s250ecp132-4'), zlib.gzipSync('{}'));
  assert.equal(findDeviceGraph('xc3s250ecp132-4'), deviceCachePath('xc3s250ecp132-4'));
  fs.rmSync(deviceCachePath('xc3s250ecp132-4'));
});

test('every shipped device description loads and has the datasheet\'s slices and user I/O pins', async () => {
  const { deviceSites } = await import('../core/fpga/place.js');
  // DS312 (Spartan-3E family data sheet): CLB slices; user I/O of the package
  const want = { 'xc3s100ecp132-4': [960, 83], 'xc3s250ecp132-4': [2448, 92], 'xc3s500efg320-4': [4656, 232], 'xc3s1200efg320-4': [8672, 250] };
  for (const [part, [slices, pads]] of Object.entries(want)) {
    assert.equal(findDeviceGraph(part), shippedDevicePath(part), part);
    const s = deviceSites(loadDeviceCache(part));
    assert.deepEqual([s.slices.size, s.pads.size], [slices, pads], part);
  }
});

test('the open flow on the shipped graph: blinky from VHDL to a complete bitstream, no Xilinx tool', { timeout: 300000 }, async () => {
  const out = path.join(tmp, 'blinky');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), path.join(ROOT, 'examples/blinky'), out],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  // no warnings (front end, synthesis, packer: each printed as "  Warning: …")
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
  const bit = fs.readFileSync(path.join(out, 'top.bit'));
  assert.ok(bit.length > 160000);
  assert.ok(bit.includes(Buffer.from([0xaa, 0x99, 0x55, 0x66])), 'the sync word');
  for (const f of ['top.json', 'placed.xdl', 'routed.xdl', 'timing.txt']) assert.ok(fs.existsSync(path.join(out, f)), f);
  // the router swaps LUT inputs: every LUT of the routed design computes the same function of the
  // same nets as in the placed design (an input not connected reads 1 in both)
  const { parseXdl, evalLut } = await import('../core/xdl.js');
  const [placed, routed] = ['placed.xdl', 'routed.xdl'].map(f => parseXdl(fs.readFileSync(path.join(out, f), 'utf8')));
  const pinNets = d => new Map(d.nets.flatMap(n => n.inpins.map(p => [`${p.inst}.${p.pin}`, n.name])));
  const pa = pinNets(placed), pb = pinNets(routed), byName = new Map(routed.insts.map(i => [i.name, i]));
  let luts = 0, swapped = 0;
  for (const ia of placed.insts.filter(i => /^SLICE/.test(i.type))) {
    for (const L of ['F', 'G']) {
      const ea = ia.cfg.find(c => c.attr === L && /^#LUT:/.test(c.value));
      if (!ea) continue;
      const eb = byName.get(ia.name).cfg.find(c => c.attr === L);
      const na = [1, 2, 3, 4].map(k => pa.get(`${ia.name}.${L}${k}`)), nb = [1, 2, 3, 4].map(k => pb.get(`${ia.name}.${L}${k}`));
      luts++;
      if (na.join() !== nb.join()) swapped++;
      const nets = [...new Set(na.filter(Boolean))];
      assert.deepEqual([...new Set(nb.filter(Boolean))].sort(), [...nets].sort(), `${ia.name} ${L}: the same nets`);
      for (let v = 0; v < 1 << nets.length; v++) {
        const env = ns => Object.fromEntries(ns.map((n, k) => [`A${k + 1}`, n ? (v >> nets.indexOf(n)) & 1 : 1]));
        assert.equal(evalLut(eb.value.slice(5), env(nb)), evalLut(ea.value.slice(5), env(na)), `${ia.name} ${L}: ${ea.value} / ${eb.value}`);
      }
    }
  }
  assert.ok(luts > 50 && swapped > 10, `${swapped} of ${luts} LUTs with their inputs swapped`);
});
