// research/s6 stage S6-C (#725), without ISE: the primitive definitions read from an XDLRC, gen-slice6.mjs's
// designs (a base slice and one variant per slice) and ana-slice6.mjs's analysis on frame data built here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { primitiveDefs } from '../research/s6/prim-defs6.mjs';
import { baseSettings, sliceVariants, sliceXdl, oneSlicePerTile, sliceDesign } from '../research/s6/gen-slice6.mjs';
import { columnOf, sliceBits, sliceSettings } from '../research/s6/ana-slice6.mjs';
import { S6_DEVICES, emptyFdri, FRAME_WORDS } from '../core/fpga/s6/bitstream.js';

const DEFS = JSON.parse(fs.readFileSync(new URL('../research/s6/measured/prim-defs.json', import.meta.url), 'utf8'));

test('prim-defs6: the elements with options or a BEL, the pins and route-throughs left out', () => {
  const text = `(primitive_defs 2
\t(primitive_def SLICEX 3 4
\t\t(pin A1 A1 input)
\t\t(element A1 1
\t\t\t(pin A1 output)
\t\t)
\t\t(element AFFMUX 2
\t\t\t(cfg O6 AX)
\t\t)
\t\t(element AFF 5 # BEL
\t\t\t(cfg OR2L AND2L #LATCH #FF)
\t\t)
\t\t(element A5FF 5 # BEL
\t\t)
\t\t(element _ROUTETHROUGH-A1-A 2
\t\t)
\t)
\t(primitive_def TIEOFF 3 3
\t\t(element KEEP1 1 # BEL
\t\t)
\t)
)`;
  assert.deepEqual(primitiveDefs(text), {
    SLICEX: { AFFMUX: { bel: false, cfg: ['O6', 'AX'] }, AFF: { bel: true, cfg: ['OR2L', 'AND2L', '#LATCH', '#FF'] }, A5FF: { bel: true, cfg: [] } },
    TIEOFF: { KEEP1: { bel: true, cfg: [] } },
  });
  // the measured file: the three slice kinds
  assert.deepEqual(DEFS.SLICEX.AOUTMUX.cfg, ['A5Q', 'O5', 'O6']);
  assert.deepEqual(DEFS.SLICEM.A6RAMMODE.cfg, ['SPRAM32', 'SRL32', 'DPRAM32', 'SPRAM64', 'DPRAM64', 'SRL16']);
  assert.equal(DEFS.SLICEL.CARRY4.bel, true);
  assert.equal(DEFS.SLICEX.CARRY4, undefined);
});

test('gen-slice6: the variants: every option, the base\'s elements removed, the BELs added, the RAM modes', () => {
  const vs = sliceVariants({ AFFMUX: { bel: false, cfg: ['O6', 'AX'] }, AFF: { bel: true, cfg: ['#LATCH', '#FF'] }, A5FF: { bel: true, cfg: [] },
    A6LUT: { bel: true, cfg: ['<eqn>'] }, A5LUT: { bel: true, cfg: ['<eqn>'] }, WEMUX: { bel: false, cfg: ['WE', 'CE'] }, A5RAMMODE: { bel: false, cfg: ['SRL16'] } });
  assert.deepEqual(vs.map(v => v.name), ['AFFMUX=#OFF', 'AFFMUX=AX', 'AFF=#OFF', 'AFF=#LATCH', 'A5FF', 'A5LUT=#LUT', 'WEMUX=WE', 'WEMUX=CE', 'A5RAMMODE=SRL16']);
  const base = baseSettings(), get = (v, e) => vs.find(x => x.name === v).settings.filter(s => s[0] === e);
  assert.equal(base.length, 24);
  assert.deepEqual(get('AFFMUX=AX', 'AFFMUX'), [['AFFMUX', '', 'AX']]);
  assert.deepEqual(get('AFF=#OFF', 'AFF'), []);
  assert.deepEqual(get('AFF=#LATCH', 'AFF'), [['AFF', 's.AFF', '#LATCH']]);
  assert.deepEqual(get('A5FF', 'A5FF'), [['A5FF', 's.A5FF', '']]);
  assert.deepEqual(get('A5RAMMODE=SRL16', 'A6LUT'), [['A6LUT', 's.A6', '#RAM:O6=(A1*A2)']]);
  assert.deepEqual(get('A5RAMMODE=SRL16', 'A5LUT'), [['A5LUT', 's.A5', '#RAM:O5=(A1*A2)']]);
  // every variant differs from the base in one element
  for (const v of vs.filter(x => !/RAMMODE/.test(x.name))) {
    const d = [...v.settings.filter(s => !base.some(b => b.join() === s.join())), ...base.filter(b => !v.settings.some(s => s.join() === b.join()))];
    assert.equal(new Set(d.map(s => s[0])).size, 1, v.name);
  }
  assert.equal(sliceXdl({ name: 'SLICE_X1Y2', kind: 'X', tile: 'CLEXL_X1Y2' }, [['A6LUT', 's.A6', '#LUT:O6=1'], ['CLKINV', '', 'CLK']]),
    'inst "SLICE_X1Y2" "SLICEX",placed CLEXL_X1Y2 SLICE_X1Y2  ,\n  cfg " A6LUT:SLICE_X1Y2.A6:#LUT:O6=1 CLKINV::CLK " ;\n');
});

test('gen-slice6: a design: one slice per tile, the base first and last; too few tiles refused', () => {
  const slices = [0, 1, 2, 3, 4, 5].flatMap(y => [{ name: `SLICE_X0Y${y}`, kind: 'L', tile: `T${y}` }, { name: `SLICE_X1Y${y}`, kind: 'X', tile: `T${y}` }]);
  assert.deepEqual(oneSlicePerTile([...slices, { name: 'SLICE_X9Y0', kind: 'L', tile: 'T0' }], 'L').map(s => s.name), [0, 1, 2, 3, 4, 5].map(y => `SLICE_X0Y${y}`));
  const def = { AFFMUX: { bel: false, cfg: ['O6', 'AX'] } };
  const { xdl, manifest } = sliceDesign('xc6slx16csg324-3', slices, 'L', def);
  assert.deepEqual(manifest, { SLICE_X0Y0: 'BASE', SLICE_X0Y1: 'AFFMUX=#OFF', SLICE_X0Y2: 'AFFMUX=AX', SLICE_X0Y3: 'BASE' });
  assert.match(xdl, /^design "sliceL" xc6slx16csg324-3 v3\.2 ,\n {2}cfg "";\ninst "SLICE_X0Y0" "SLICEL"/);
  assert.equal((xdl.match(/^inst /gm) || []).length, 4);
  assert.throws(() => sliceDesign('p', slices.slice(0, 4), 'L', def), /p: 2 SLICEL tiles for 4 slices/);
  // the measured definitions fit the XC6SLX16's tiles: X 70, L 114, M 169 variants
  assert.deepEqual(['SLICEX', 'SLICEL', 'SLICEM'].map(k => sliceVariants(DEFS[k]).length), [70, 114, 169]);
});

const dev = S6_DEVICES.xc6slx16;
test('ana-slice6: a frame\'s column; a slice\'s bits in its column and band; the variants against the base', () => {
  assert.deepEqual(columnOf(dev, 0), [0, 4]);
  assert.deepEqual(columnOf(dev, 55), [34, 30]);
  assert.deepEqual(columnOf(dev, 744 + 70), [744 + 64, 31]);
  assert.throws(() => columnOf(dev, 742), /frame 742: in no column/);
  const fdri = emptyFdri(dev), set = (f, b) => { fdri[f * FRAME_WORDS + (b >> 4)] |= 0x8000 >> (b & 15); };
  const bases = { S0: [55, 848], S1: [55, 784], S2: [55, 720], S3: [55 + 744, 848] };
  // the base: (0, 0) and (-21, 63) (the column's first frame); variant S1 adds (4, 9) and clears (0, 0)
  for (const n of ['S0', 'S2', 'S3']) { set(bases[n][0], bases[n][1]); set(bases[n][0] - 21, bases[n][1] + 63); }
  set(bases.S1[0] - 21, bases.S1[1] + 63); set(bases.S1[0] + 4, bases.S1[1] + 9);
  set(55 + 9, 848 + 64); // outside S0's band: not its
  assert.deepEqual(sliceBits(fdri, dev, bases.S0), [[-21, 63], [0, 0]]);
  const r = sliceSettings(fdri, dev, { S0: 'BASE', S1: 'AFFMUX=AX', S2: 'AFF=#OFF', S3: 'BASE' }, bases);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.variants, { 'AFFMUX=AX': { set: [[4, 9]], clear: [[0, 0]] }, 'AFF=#OFF': { set: [], clear: [] } });
  set(bases.S3[0] + 1, bases.S3[1]);
  assert.deepEqual(sliceSettings(fdri, dev, { S0: 'BASE', S3: 'BASE' }, bases).problems, ['S3: the base differs from S0\'s']);
});

test('the XC6SLX16\'s slice settings, measured: the flip-flops\', the SLICEX\'s frame its neighbour\'s', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-slice.json', import.meta.url), 'utf8'));
  const luts = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-lut.json', import.meta.url), 'utf8'));
  const v = (k, n) => db.kinds[k].variants[n];
  // SYNC_ATTR: SYNC sets one bit, ASYNC clears it; a flip-flop as a latch, AND2L or OR2L: one bit for the four
  assert.deepEqual(v('L', 'SYNC_ATTR=ASYNC'), { set: [], clear: [[4, 27]] });
  assert.deepEqual(v('M', 'SYNC_ATTR=ASYNC'), { set: [], clear: [[5, 27]] });
  for (const p of ['A', 'B', 'C', 'D']) for (const m of ['#LATCH', 'AND2L', 'OR2L']) assert.deepEqual(v('L', `${p}FF=${m}`), { set: [[4, 25]], clear: [] });
  assert.deepEqual(v('L', 'AFFSRINIT=SRINIT1'), { set: [[4, 55]], clear: [] });
  // without nets on its pins a setting of the routing sets nothing (CLKINV, the outputs used)
  assert.deepEqual(v('L', 'CLKINV=CLK_B'), { set: [], clear: [] });
  // the SLICEX's frame before its LUTs' is its neighbour's frame 4 (SLICEL) or 5 (SLICEM): the bits of a used slice
  // the LUT map's zero design set there (S6-B) are the SLICEX's
  const b = luts.slices;
  assert.equal(b.SLICE_X1Y5[0] - b.SLICE_X0Y5[0], 5);
  assert.equal(b.SLICE_X3Y5[0] - b.SLICE_X2Y5[0], 6);
  const xb = db.kinds.X.base.filter(([f]) => f === -1).map(([, x]) => x);
  assert.deepEqual(xb, [9, 10, 15, 33, 47]);
  assert.deepEqual(['A', 'B', 'C', 'D'].map(p => v('X', `${p}FFMUX=${p}X`).set), [[[-1, 45]], [[-1, 44]], [[-1, 30]], [[-1, 29]]]);
});
