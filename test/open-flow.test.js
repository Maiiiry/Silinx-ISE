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

// the open flow of a project: its exit status, output and warnings (every line that says "warning")
const openFlow = (dir, out) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), dir, out],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  return { ...r, warnings: `${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()) };
};
// the warnings of the open flow on blinky, the same on every device: Yosys's note about shift registers
const BLINKY_WARNINGS = ['Warning: Shift register inference not yet supported for family xc3se.'];

test('the open flow on the shipped graph: blinky from VHDL to a complete bitstream, no Xilinx tool', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'blinky');
  const r = openFlow(path.join(ROOT, 'examples/blinky'), out);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
  assert.deepEqual(r.warnings, BLINKY_WARNINGS);
  const bit = fs.readFileSync(path.join(out, 'top.bit'));
  assert.ok(bit.length > 160000);
  assert.ok(bit.includes(Buffer.from([0xaa, 0x99, 0x55, 0x66])), 'the sync word');
  for (const f of ['top.json', 'placed.xdl', 'routed.xdl', 'timing.txt']) assert.ok(fs.existsSync(path.join(out, f)), f);
});

// blinky on the other boards (stage E of research/s3e-bitstream): the Basys2-100 with the Basys2's
// pins, the Nexys2-500 / -1200 with the Nexys2's (LD4-LD7 differ by die)
const NEXYS2 = led => [['clk', 'B8'], ['sw<0>', 'G18'], ['sw<1>', 'H18'], ['sw<2>', 'K18'], ['sw<3>', 'K17'], ['btn<0>', 'B18'], ['btn<1>', 'D18'],
  ...led.map((p, i) => [`led<${i}>`, p])].map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;`).join('\n') + '\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n';
const BOARDS = [
  ['Basys2-100', 'xc3s100e', 'cp132', null, 72738],
  ['Nexys2-500', 'xc3s500e', 'fg320', NEXYS2(['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4']), 283846],
  ['Nexys2-1200', 'xc3s1200e', 'fg320', NEXYS2(['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4']), 480219],
];
for (const [board, part, pkg, ucf, size] of BOARDS) {
  test(`the open flow for the ${board} (${part.toUpperCase()}-${pkg.toUpperCase()}): blinky to a complete bitstream, the exact warnings`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `proj-${board}`);
    fs.cpSync(path.join(ROOT, 'examples/blinky'), dir, { recursive: true });
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    Object.assign(pj.device, { part, package: pkg });
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj, null, 2));
    if (ucf) fs.writeFileSync(path.join(dir, pj.constraints), ucf);
    const out = path.join(tmp, `out-${board}`);
    const r = openFlow(dir, out);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
    assert.deepEqual(r.warnings, BLINKY_WARNINGS);
    const bit = fs.readFileSync(path.join(out, 'top.bit'));
    assert.equal(bit.length, size, 'the .bit of the device');
    assert.ok(bit.includes(Buffer.from(`${part.slice(2)}${pkg}\0`)), 'the part in the header');
  });
}
