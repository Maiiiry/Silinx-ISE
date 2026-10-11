// The bit databases of the Spartan-3E devices (research/s3e-bitstream/db, stage F): the bitstream
// format of each device, the one loader (research/s3e-bitstream/db.mjs: shared tile types, the
// device's own files, the pads per package), and the committed files checked against the shipped
// device descriptions (core/fpga/devices/), without ISE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S3E_DEVICES, XC3S250E, bitFormat, writeBit, readBit, setBit, diffFrames } from '../core/fpga/bitstream.js';
import { makeDb, layoutFormat, bitgen, frameData, padsFromDevice, knownRouting, featureBits, tileOf, tileBase } from '../core/fpga/bitgen.js';
import { parseXdl } from '../core/xdl.js';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { DB_DIR, splitPart, mergeTiles, hasBitDb, readDbFiles, dbPackages, loadDb, edges } from '../research/s3e-bitstream/db.mjs';
import { graphFromDevice } from '../research/s3e-bitstream/xdlrc-graph.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s3e-devices-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// the boards' parts: device, package, slices, bonded pads, block RAMs (DS312)
const PARTS = {
  'xc3s100ecp132-4': { device: 'xc3s100e', pkg: 'cp132', slices: 960, pads: 83, brams: 4 },
  'xc3s250ecp132-4': { device: 'xc3s250e', pkg: 'cp132', slices: 2448, pads: 92, brams: 12 },
  'xc3s500efg320-4': { device: 'xc3s500e', pkg: 'fg320', slices: 4656, pads: 232, brams: 20 },
  'xc3s1200efg320-4': { device: 'xc3s1200e', pkg: 'fg320', slices: 8672, pads: 250, brams: 28 },
};

test('bitstream formats: IDCODE, frame length and frames of each device (measured on empty designs)', () => {
  assert.deepEqual(Object.keys(S3E_DEVICES), ['xc3s100e', 'xc3s250e', 'xc3s500e', 'xc3s1200e']);
  assert.equal(S3E_DEVICES.xc3s250e, XC3S250E);
  assert.deepEqual([S3E_DEVICES.xc3s100e.idcode, S3E_DEVICES.xc3s100e.frameWords, S3E_DEVICES.xc3s100e.frames], [0x01c10093, 49, 369]);
  assert.deepEqual([S3E_DEVICES.xc3s500e.idcode, S3E_DEVICES.xc3s500e.frameWords, S3E_DEVICES.xc3s500e.frames], [0x01c22093, 97, 730]);
  assert.deepEqual([S3E_DEVICES.xc3s1200e.idcode, S3E_DEVICES.xc3s1200e.frameWords, S3E_DEVICES.xc3s1200e.frames], [0x01c2e093, 125, 959]);
  // a frame is 32 bits per word: two 80-bit I/O rows and 64 bits per CLB row (DS312: 22, 34, 46, 60 rows)
  for (const [d, rows] of [['xc3s100e', 22], ['xc3s250e', 34], ['xc3s500e', 46], ['xc3s1200e', 60]]) assert.equal(S3E_DEVICES[d].frameWords * 32, 160 + 64 * rows, d);
  assert.deepEqual(bitFormat('xc3s500efg320-4'), S3E_DEVICES.xc3s500e);
  assert.equal(bitFormat('xc3s500e', 'ft256').part, '3s500eft256');
  assert.equal(bitFormat('XC3S100E').part, '3s100ecp132');
  assert.equal(bitFormat('xc3s1600efg320-4'), null);
  assert.equal(bitFormat('xc6slx16'), null);
});

test('writeBit / readBit for each device: the header part, IDCODE, FLR and the frames', () => {
  for (const f of Object.values(S3E_DEVICES)) {
    const frames = new Uint32Array(f.frames * f.frameWords);
    setBit(frames, f.frameWords, f.frames - 2, 17);
    const r = readBit(writeBit({ frames, device: f, crc: false }));
    assert.equal(r.header.b, f.part);
    assert.deepEqual(r.packets.find(p => p.reg === 'IDCODE').words, [f.idcode]);
    assert.deepEqual(r.packets.find(p => p.reg === 'FLR').words, [f.frameWords - 1]);
    assert.equal(r.frameWords, f.frameWords);
    assert.equal(r.frames.frameWords, f.frameWords);
    // the frame length of the data itself is used to tell the bits apart
    assert.deepEqual(diffFrames(new Uint32Array(frames.length), r.frames), [{ frame: f.frames - 2, bit: 17, value: 1 }]);
    assert.throws(() => writeBit({ frames: new Uint32Array(10), device: f }), /frame data: 10 words/);
  }
});

test('layoutFormat: the bitstream format of a database from its layout', () => {
  assert.deepEqual(layoutFormat({ device: 'xc3s500e-4-fg320' }), S3E_DEVICES.xc3s500e);
  assert.equal(layoutFormat({ device: 'xc3s500e-4-ft256' }).part, '3s500eft256');
  assert.deepEqual(layoutFormat({ device: 'xc3s100e-4-cp132', idcode: '0x01c10093', frameWords: 49, frames: 369 }), S3E_DEVICES.xc3s100e);
  assert.deepEqual(layoutFormat(null), XC3S250E);
});

// a synthetic database of a small device: one CLB column, one row
const synth = device => ({
  layout: { device, cols: { 0: 3, 1: 24, 2: 43 }, rows: { 0: 80, 1: 16, 2: 0 }, defaults: [[5, 7]] },
  lut: { colFrame: { 0: 24, 1: 27 }, rowBit: { 0: 40, 1: 8 } },
  tiles: { types: { CENTER_SMALL: { features: { 'SLICE0:USED': ['1,2'], 'SLICE0:F:#LUT': [], 'SLICE0:G:#LUT': [], 'SLICE0:FXMUX:F': [], 'SLICE0:XUSED:0': [], 'SLICE0:GYMUX:G': [], 'SLICE0:YUSED:0': [] } } } },
});

test('bitgen writes the database device\'s format: a design for the XC3S100E', () => {
  const db = makeDb(synth('xc3s100e-4-cp132'));
  assert.equal(db.format.idcode, 0x01c10093);
  const design = `design "t" xc3s100ecp132-4 v3.2 , cfg "";
inst "s" "SLICEL",placed CLB_X1Y1 SLICE_X0Y0 , cfg " F:s_f:#LUT:D=A1 G:s_g:#LUT:D=A1 FXMUX::F XUSED::0 GYMUX::G YUSED::0 " ;
`;
  const { bytes, unknown } = bitgen(design, db, { name: 't.ncd', crc: false });
  assert.deepEqual(unknown, []);
  const r = readBit(bytes);
  assert.equal(r.header.b, '3s100ecp132');
  assert.equal(r.frames.length, 369 * 49);
  const fd = frameData(parseXdl(design), db);
  assert.equal(fd.frames.frameWords, 49);
  assert.deepEqual(diffFrames(fd.frames, r.frames), []);
  // the default bit, the slice's USED bit (frame 24 + 1, bit 16 + 2), LUT F of SLICE_X0Y0 at frame 24, bit 40
  const set = diffFrames(new Uint32Array(r.frames.length), r.frames);
  assert.ok(set.some(x => x.frame === 5 && x.bit === 7));
  assert.ok(set.some(x => x.frame === 25 && x.bit === 18));
  assert.ok(set.some(x => x.frame === 24 && x.bit >= 40 && x.bit < 56));
  // a part given by the caller (another package) is written in the header
  assert.equal(readBit(bitgen(design, db, { part: '3s100evq100' }).bytes).header.b, '3s100evq100');
});

test('db.mjs: parts, the shared tile types with a device\'s own over them, the pads per package', () => {
  assert.deepEqual(splitPart('xc3s500efg320-4'), { device: 'xc3s500e', pkg: 'fg320' });
  assert.deepEqual(splitPart('XC3S1200E'), { device: 'xc3s1200e', pkg: null });
  assert.deepEqual(splitPart('xc3s250e-cp132'), { device: 'xc3s250e-cp132', pkg: null });
  const shared = { source: 's', types: { A: { features: { f: ['1,1'], g: [] } }, B: { sameAs: 'A', features: {} } }, padDriveDefault: { LVCMOS15: '8' } };
  const own = { types: { A: { features: { g: ['2,2'] } }, C: { features: { h: [] } } }, padDriveDefault: { LVCMOS12: '6' } };
  const m = mergeTiles(shared, own);
  assert.deepEqual(m.types.A.features, { f: ['1,1'], g: ['2,2'] });
  assert.equal(m.types.B.sameAs, 'A');
  assert.deepEqual(m.types.C.features, { h: [] });
  assert.deepEqual(m.padDriveDefault, { LVCMOS15: '8', LVCMOS12: '6' });
  assert.deepEqual(shared.types.A.features.g, [], 'the shared table is not changed');
  assert.equal(mergeTiles(shared, null), shared);
  // a database folder of its own
  const dir = path.join(tmp, 'db');
  fs.mkdirSync(dir);
  const w = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o));
  const s = synth('xc3s500e-4-fg320');
  w('s3e-tiles.json', s.tiles);
  w('xc3s500e-layout.json', s.layout);
  w('xc3s500e-lut.json', { lutF: s.lut });
  assert.equal(hasBitDb('xc3s500e', { dir }), true);
  assert.equal(hasBitDb('xc3s500e', { pkg: 'fg320', dir }), false, 'no pads of the package yet');
  assert.equal(hasBitDb('xc3s100e', { dir }), false);
  assert.deepEqual(dbPackages('xc3s500e', dir), []);
  w('xc3s500e-fg320-pads.json', { padFeatures: { B8: { 'I:LVCMOS33': ['3,9'] } } });
  w('xc3s500e-tiles.json', { types: { CENTER_SMALL: { features: { 'SLICE1:USED': ['1,3'] } } } });
  assert.equal(hasBitDb('xc3s500e', { pkg: 'fg320', dir }), true);
  assert.deepEqual(dbPackages('xc3s500e', dir), ['fg320']);
  const f = readDbFiles('xc3s500e', { pkg: 'fg320', dir });
  assert.deepEqual(f.tiles.types.CENTER_SMALL.features['SLICE1:USED'], ['1,3']);
  assert.deepEqual(f.tiles.types.CENTER_SMALL.features['SLICE0:USED'], ['1,2']);
  assert.deepEqual(f.padFeatures, { B8: { 'I:LVCMOS33': ['3,9'] } });
  assert.equal(f.bram, null);
  // loadDb: without a description (graph: {} has no sites) the pads table is empty; the header's part is the package's
  const db = loadDb('xc3s500eft256-4', { dir, graph: { siteIndex: new Map() } });
  assert.equal(db.format.part, '3s500eft256');
  assert.equal(db.format.idcode, 0x01c22093);
  assert.deepEqual(db.padFeats, {}, 'no pads measured for the FT256');
  assert.throws(() => loadDb('xc3s1600efg320-4', { dir }), /no bit database for xc3s1600e/);
  assert.deepEqual(edges(s.layout), { maxX: 2, maxY: 2 });
});

test('graphFromDevice: the experiments\' graph from a shipped device description', () => {
  const d = loadDeviceCache('xc3s100ecp132-4');
  const g = graphFromDevice(d);
  assert.equal(g.tiles.length, d.tileCount);
  assert.equal(g.pipCount, d.pipCount);
  const t = g.tileByName.get('CLB_X9Y5');
  // a PIP of the tile, its wires and their nodes: a node is numbered by one of its wires' tile
  const i = g.pipsOf(t).find(k => g.names[g.pipB[k]] === 'OMUX0' && !g.rt[k]);
  assert.ok(i !== undefined);
  const n = g.node(t, g.names[g.pipB[i]]);
  assert.ok(g.members(n).some(([tt, w]) => tt === t && w === g.names[g.pipB[i]]));
  for (const [tt] of g.members(n)) assert.equal(g.node(tt, g.members(n).find(m => m[0] === tt)[1]), n);
  // a wire the tile does not have is a node of its own
  assert.notEqual(g.node(t, 'IOIS_X0'), n);
  const slice = g.tiles[t].sites.find(s => s.name === 'SLICE_X16Y8');
  assert.equal(slice.type, 'SLICEM');
  assert.equal(slice.pins.X.dir, 'output');
  assert.ok(g.tiles.some(x => x.sites.some(s => s.bonded === 'bonded')));
});

// the committed databases against the shipped device descriptions
for (const [part, want] of Object.entries(PARTS)) {
  test(`committed database of the ${want.device.toUpperCase()}: layout, LUTs, pads of the ${want.pkg.toUpperCase()}, block RAMs`, () => {
    assert.equal(hasBitDb(want.device, { pkg: want.pkg }), true);
    assert.deepEqual(dbPackages(want.device, DB_DIR), [want.pkg]);
    const dev = loadDeviceCache(part);
    const db = loadDb(part, { graph: dev });
    const f = S3E_DEVICES[want.device];
    assert.deepEqual([db.format.idcode, db.format.frameWords, db.format.frames, db.format.part], [f.idcode, f.frameWords, f.frames, f.part]);
    const L = db.layout;
    const { maxX, maxY } = edges(L);
    // every CLB tile column has a column of frames, every CLB row a row of bits; 19 frames per CLB column
    const clbs = dev.tileNames.filter(n => /^CLB_/.test(n)).map(n => /X(\d+)Y(\d+)/.exec(n).slice(1).map(Number));
    assert.equal(maxX, Math.max(...clbs.map(c => c[0])) + 1);
    assert.equal(maxY, Math.max(...clbs.map(c => c[1])) + 1);
    const starts = Object.values(L.cols).sort((a, b) => a - b);
    assert.equal(new Set(starts).size, starts.length, 'one column per frame');
    for (let i = 1; i < starts.length; i++) assert.ok([19, 21, 76].includes(starts[i] - starts[i - 1]) || starts[i] - starts[i - 1] > 19, `columns ${starts[i - 1]} ${starts[i]}`);
    assert.equal(L.rows[maxY], 0);
    assert.equal(L.rows[0], f.frameWords * 32 - 80);
    for (let y = 1; y < maxY; y++) assert.equal(L.rows[y], 80 + 64 * (maxY - 1 - y), `row ${y}`);
    // the LUTs of every slice
    const slices = dev.sites().filter(s => /^SLICE[LM]$/.test(s.type));
    assert.equal(slices.length, want.slices);
    const frames = new Set();
    for (const s of slices) {
      const [, x, y] = /X(\d+)Y(\d+)/.exec(s.name).map(Number);
      assert.ok(db.lut.colFrame[x] !== undefined && db.lut.rowBit[y] !== undefined, s.name);
      frames.add(`${db.lut.colFrame[x]},${db.lut.rowBit[y]}`);
    }
    assert.equal(frames.size, want.slices, 'every LUT has its own place');
    // the horizontal clock rows: one bit in the I/O rows each
    const gy = [...new Set(dev.tileNames.filter(n => /^GCLKH_X/.test(n)).map(n => +/Y(\d+)$/.exec(n)[1]))];
    assert.deepEqual(Object.keys(L.typeRows.GCLKH).map(Number).sort((a, b) => a - b), gy.sort((a, b) => a - b));
    for (const b of Object.values(L.typeRows.GCLKH)) assert.ok(b < 8 || b >= f.frameWords * 32 - 8);
    // the pads: every bonded pad of the package has its LVCMOS33 input (and output, but for the input-only pads)
    const pads = padsFromDevice(dev);
    assert.equal(Object.keys(pads).length, want.pads);
    for (const p of Object.keys(pads)) {
      assert.ok(db.padFeats[p]?.['I:LVCMOS33']?.length, `${p} I:LVCMOS33`);
      if (dev.site(p).type !== 'IBUF' && !/I$/.test(dev.site(p).type)) assert.ok(db.padFeats[p]?.['O:LVCMOS33']?.length, `${p} O:LVCMOS33`);
    }
    // the block RAMs: every memory bit, every block RAM
    assert.equal(Object.keys(db.bram.colFrame).length * Object.keys(db.bram.rowBit).length >= want.brams, true);
    assert.equal(db.bram.df.length, 18432);
    for (const s of dev.sites('RAMB16')) {
      const [, x, y] = /X(\d+)Y(\d+)/.exec(s.name).map(Number);
      assert.ok(db.bram.colFrame[x] !== undefined && db.bram.rowBit[y] !== undefined, s.name);
    }
  });
}

test('the tile types are shared: the XC3S250E\'s measurements serve the other devices', () => {
  const t = JSON.parse(fs.readFileSync(path.join(DB_DIR, 's3e-tiles.json'), 'utf8')).types;
  // the XC3S1200E's clock tiles are the others' (…_LL), the XC3S100E's DCM-less corners share the CLB switch box
  for (const [a, b] of [['CLKT_LL', 'CLKT'], ['CLKB_LL', 'CLKB'], ['CLKC_LL', 'CLKC'], ['DCMAUX_BL_CENTER', 'CENTER_SMALL'], ['DCMAUX_TL_CENTER', 'CENTER_SMALL']]) assert.equal(t[a].sameAs, b, a);
  // the horizontal clock rows of the I/O and block-RAM columns are GCLKH tiles: one bit by row (layout typeRows)
  for (const a of ['GCLKH_PCI_CE_N', 'GCLKH_PCI_CE_S', 'BRAMSITE2_UP_GCLKH', 'BRAM2_DN_GCLKH_FEEDTHRUA']) assert.equal(t[a].sameAs, 'GCLKH', a);
  for (const d of ['xc3s250e', 'xc3s500e', 'xc3s1200e']) {
    const L = readDbFiles(d).layout;
    for (const [y, b] of Object.entries(L.typeRows.GCLKH)) for (const a of ['GCLKH_PCI_CE_N', 'GCLKH_PCI_CE_S']) if (L.typeRows[a]?.[y] !== undefined) assert.equal(L.typeRows[a][y], b, `${d} ${a} ${y}`);
  }
  // the REV pin of a flip-flop: one bit per slice position (stage F)
  assert.deepEqual(['SLICE0', 'SLICE1', 'SLICE2', 'SLICE3'].map(s => t.CENTER_SMALL.features[`${s}:REVUSED:0`]), [['1,40'], ['1,8'], ['2,40'], ['2,8']]);
});

test('the XC3S1200E\'s own features: the long-line splitters of the centre row, not used by the router', () => {
  const db = loadDb('xc3s1200efg320-4', { graph: { siteIndex: new Map() } });
  const t = tileOf('CLKH_LL_X7Y30', db);
  assert.equal(t.type, 'CLKH_LL');
  // one bit in the I/O row at the top (bits 1, 2) or at the bottom (bit FB - 3) of the tile's column
  assert.deepEqual(tileBase(t, db), { frame: db.layout.cols[7], bit: 0 });
  assert.deepEqual(featureBits(db.types.CLKH_LL, 'CLKH_LLT_LV6->CLKH_LLB_LV6'), ['15,1']);
  assert.deepEqual(featureBits(db.types.CLKH_LL, 'CLKH_LLB_LV1->CLKH_LLT_LV1'), ['18,1']);
  assert.deepEqual(featureBits(db.types.CLKH_LL, 'CLKH_LLT_LV1->CLKH_LLB_LV1'), [`18,${125 * 32 - 3}`]);
  assert.equal([...db.types.CLKH_LL.feats.keys()].length, 48);
  const k = knownRouting(db);
  assert.equal(k.allowPip('CLKH_LL_X7Y30', 'CLKH_LLT_LV6', 'CLKH_LLB_LV6'), false, 'noRoute: the direction of "a =- b" is not known');
  assert.equal(k.allowPip('CLB_X7Y30', 'OMUX0', 'E2BEG0'), k.allowPip('CLB_X7Y31', 'OMUX0', 'E2BEG0'));
  // the other devices have no such tiles: the shared file does not hold them
  assert.equal(JSON.parse(fs.readFileSync(path.join(DB_DIR, 's3e-tiles.json'), 'utf8')).types.CLKH_LL, undefined);
  // the upper horizontal clock rows of the XC3S1200E start one bit further than the others' (bits 1-3 are the splitters')
  assert.deepEqual(db.layout.typeRows.GCLKH, { 6: 125 * 32 - 1, 22: 125 * 32 - 2, 38: 3, 54: 4 });
  assert.deepEqual(readDbFiles('xc3s500e').layout.typeRows.GCLKH, { 7: 97 * 32 - 1, 15: 97 * 32 - 2, 31: 2, 39: 3 });
});
