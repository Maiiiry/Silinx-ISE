// research/s3e-bitstream: helpers of the bit database's experiments (no ISE, no device report), and
// the stage D rules as they are in the committed database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePatterns, stripLutRuns } from '../research/s3e-bitstream/lib.mjs';
import { SHIFTS } from '../research/s3e-bitstream/share-sb.mjs';
import { MIRRORS, mirrorFeatures } from '../research/s3e-bitstream/dcm-mirror.mjs';
import { makeDb, featureBits } from '../core/fpga/bitgen.js';

test('resolvePatterns: a PIP measured with different bits keeps the pattern without artefacts', () => {
  const p = (pat, n) => [pat, new Array(n).fill('T')];
  // a cleared bit: the pin's input multiplexer fell back to another setting when the PIP was removed
  assert.deepEqual(resolvePatterns([p('11,31 12,27 12,28 12,29', 1), p('!11,30 11,31 12,28 12,29', 1)]).map(x => x[0]), ['11,31 12,27 12,28 12,29']);
  // a LUT turned into the constant 0 (16 bits of one LUT block) when its only route was removed
  const lut = Array.from({ length: 16 }, (_, i) => `3,${32 + i}`).join(' ');
  assert.deepEqual(resolvePatterns([p(`${lut} 7,24`, 2), p('7,24', 2)]).map(x => x[0]), ['7,24']);
  // no bits while another tile has them (bits given to a neighbouring tile)
  assert.deepEqual(resolvePatterns([p('', 1), p('14,4 14,5', 1)]).map(x => x[0]), ['14,4 14,5']);
  // nothing to tell apart: both stay
  assert.equal(resolvePatterns([p('1,1', 1), p('2,2', 1)]).length, 2);
});

test('stripLutRuns: a LUT cleared when a PIP was removed is not the PIP\'s', () => {
  const lut = Array.from({ length: 16 }, (_, i) => `3,${32 + i}`);
  assert.deepEqual(stripLutRuns([...lut, '7,55']), ['7,55']);
  assert.deepEqual(stripLutRuns(['11,31', '12,27', '12,28', '!12,29']), ['11,31', '12,27', '12,28', '!12,29']);
});

test('share-sb: every tile type shares the switch box at one offset', () => {
  const all = Object.values(SHIFTS).flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(SHIFTS['2,0'].includes('LIOIS') && SHIFTS['0,16'].includes('TIOIS') && SHIFTS['0,0'].includes('BRAM1_SMALL'));
});

// the committed database
const dbDir = new URL('../research/s3e-bitstream/db/', import.meta.url);
const read = f => JSON.parse(fs.readFileSync(new URL(f, dbDir), 'utf8'));

test('measured database: the I/O, block-RAM and DCM tiles use the CLB switch box', () => {
  const tiles = read('s3e-tiles.json');
  for (const [sh, types] of Object.entries(SHIFTS)) for (const t of types) {
    assert.equal(tiles.types[t]?.sameAs, 'CENTER_SMALL', t);
    assert.deepEqual(tiles.types[t].shift || [0, 0], sh.split(',').map(Number), t);
  }
  const db = makeDb({ layout: read('xc3s250e-layout.json'), lut: read('xc3s250e-lut.json').lutF, tiles });
  const clb = db.types.CENTER_SMALL.feats.get('S2MID4->E2BEG4');
  assert.ok(clb.length);
  assert.deepEqual(db.types.BRAM1_SMALL.feats.get('S2MID4->E2BEG4'), clb);
  assert.deepEqual(db.types.LIOIS.feats.get('S2MID4->E2BEG4'), clb.map(s => s.replace(/^(\d+)/, f => +f + 2)));
  // the I/O tile's own pin wires: IOIS_F1_B0 is the CLB's F1_B0
  assert.ok(db.types.CENTER_SMALL.feats.get('E2END6->F1_B0').length);
  assert.deepEqual(featureBits(db.types.BIOIS, 'E2END6->IOIS_F1_B0'), db.types.CENTER_SMALL.feats.get('E2END6->F1_B0'));
});

test('measured database: the terminal tiles\' PIPs set no bits', () => {
  const tiles = read('s3e-tiles.json');
  const term = Object.entries(tiles.types).filter(([t]) => /TERM/.test(t));
  assert.ok(term.length > 20);
  for (const [t, ty] of term) {
    assert.equal(ty.pipsWithoutBits, true, t);
    assert.ok(!Object.keys(ty.features).some(f => /->/.test(f)), t);
  }
});

test('measured database: SLICEM instances, the constant sources and the carry outputs', () => {
  const f = read('s3e-tiles.json').types.CENTER_SMALL.features;
  assert.deepEqual(f['SLICE0:SLICEM'], ['1,55', '1,57']);
  assert.deepEqual(f['SLICE1:SLICEM'], ['1,23', '1,25']);
  assert.deepEqual(f['SLICE1:_GND_SOURCE:Y'], []);
  assert.deepEqual(f['SLICE3:XBUSED:0'], []);
});

test('measured database: every memory bit of the block RAMs has its own place', () => {
  const b = read('xc3s250e-bram.json');
  assert.equal(b.df.length, 18432);
  assert.equal(Object.keys(b.colFrame).length, 2);
  assert.equal(Object.keys(b.rowBit).length, 6);
  // no two memory bits of a block RAM in the same place
  assert.equal(new Set(b.df.map((f, i) => `${f},${b.db[i]}`)).size, 18432);
});

test('measured database: block-RAM, multiplier and DCM settings', () => {
  const t = read('s3e-tiles.json').types;
  const b = t.BRAMSITE2.features;
  // the port widths: a 3-bit code per port
  assert.deepEqual(b['RAMB16:PORTA_ATTR:16384X1'], []);
  assert.deepEqual(b['RAMB16:PORTA_ATTR:2048X9'], ['1,-51@-1,0', '1,-53@-1,0']);
  // every bit of a 36-bit output latch value has its place
  for (let i = 0; i < 36; i++) assert.ok(b[`RAMB16:SRVAL_B@512X36:${i}`]?.length, `SRVAL_B bit ${i}`);
  assert.deepEqual(b['MULT18X18SIO:AREG:1'], ['1,-189@-1,0']);
  assert.equal(t.BRAMSITE2_BRK.sameAs, 'BRAMSITE2');
  const d = t.DCM_TL_CENTER.features;
  for (let m = 2; m <= 32; m++) assert.ok(Array.isArray(d[`DCM:CLKFX_MULTIPLY:${m}`]), `CLKFX_MULTIPLY ${m}`);
  assert.ok(d['DCM:USED'].length > 20);
});

test('dcm-mirror: the other DCMs\' settings are the top-left one\'s mirrored, but for the inverters and the pair\'s bits', () => {
  const tl = { 'DCM:STARTUP_WAIT:STARTUP_WAIT': ['0,89'], 'DCM:DUTY_CYCLE_CORRECTION:FALSE': ['!0,77'], 'DCM:CLKIN:LOW': ['-39,121', '-39,141'],
    'DCM:CLKFX_IN:LOW': ['!37,240', '37,242'], 'DCM:RSTINV:RST': ['3,38'], 'E2MID1->DCM_G1_B1': ['1,2'] };
  // measured on each DCM (sv-dcm-a / sv-dcm-b): STARTUP_WAIT, DCC, the input period, the CLKFX input range, an inverter
  assert.deepEqual(mirrorFeatures(tl, 'DCM_TR_CENTER'), { 'DCM:STARTUP_WAIT:STARTUP_WAIT': ['18,89'], 'DCM:DUTY_CYCLE_CORRECTION:FALSE': ['!18,77'],
    'DCM:CLKIN:LOW': ['57,121', '57,141'], 'DCM:CLKFX_IN:LOW': ['!18,240', '18,242'], 'DCM:RSTINV:RST': ['3,38'] });
  assert.deepEqual(mirrorFeatures(tl, 'DCM_BL_CENTER'), { 'DCM:STARTUP_WAIT:STARTUP_WAIT': ['0,-26'], 'DCM:DUTY_CYCLE_CORRECTION:FALSE': ['!0,-14'],
    'DCM:CLKIN:LOW': ['-39,-58', '-39,-78'], 'DCM:CLKFX_IN:LOW': ['!37,-80', '37,-78'], 'DCM:RSTINV:RST': ['3,38'] });
  assert.deepEqual(mirrorFeatures(tl, 'DCM_BR_CENTER')['DCM:STARTUP_WAIT:STARTUP_WAIT'], ['18,-26']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_BR_CENTER')['DCM:CLKFX_IN:LOW'], ['!18,-80', '18,-78']);
  assert.deepEqual(Object.keys(MIRRORS), ['DCM_TR_CENTER', 'DCM_BL_CENTER', 'DCM_BR_CENTER', 'DCM_H_BR_CENTER', 'DCM_H_BL_CENTER', 'DCM_H_TR_CENTER', 'DCM_H_TL_CENTER']);
  // the XC3S1200E's side DCMs, measured on each (sv-dcmh-a / sv-dcmh-b): the same four images, their own pairs
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_BR_CENTER')['DCM:CLKIN:LOW'], ['-39,121', '-39,141']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_BR_CENTER')['DCM:CLKFX_IN:LOW'], ['!0,240', '0,242']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_BL_CENTER')['DCM:STARTUP_WAIT:STARTUP_WAIT'], ['18,89']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_BL_CENTER')['DCM:CLKFX_IN:LOW'], ['!18,-144', '18,-142']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_TR_CENTER')['DCM:STARTUP_WAIT:STARTUP_WAIT'], ['0,-26']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_TR_CENTER')['DCM:CLKFX_IN:LOW'], ['!0,304', '0,306']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_TL_CENTER')['DCM:DUTY_CYCLE_CORRECTION:FALSE'], ['!18,-14']);
  assert.deepEqual(mirrorFeatures(tl, 'DCM_H_TL_CENTER')['DCM:CLKFX_IN:LOW'], ['!18,-80', '18,-78']);
  // the committed database: the three other DCMs have every setting of the top-left one, their PIPs kept
  const t = read('s3e-tiles.json').types;
  const own = Object.fromEntries(Object.entries(t.DCM_TL_CENTER.features).filter(([k]) => k.startsWith('DCM:')));
  for (const type of Object.keys(MIRRORS)) {
    const f = t[type].features;
    assert.deepEqual(Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('DCM:'))), mirrorFeatures(own, type), type);
    assert.ok(Object.keys(f).some(k => k.includes('->')), `${type}: its PIPs`);
  }
  // each clock output has its own enable bit (no longer in DCM:USED); CLKFX and the status pins none
  const d = t.DCM_TL_CENTER.features;
  assert.deepEqual(['CLK0', 'CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180', 'LOCKED'].map(p => d[`DCM:OUT:${p}`]),
    [['0,73'], ['0,75'], ['0,74'], ['0,76'], ['0,97'], ['0,98'], ['0,99'], [], [], []]);
  assert.ok(!d['DCM:USED'].some(b => ['0,73', '0,97', '0,99'].includes(b)));
  // the DCMs' pins measured on designs of every DCM of each device (learn-9): the outputs into the switch box
  assert.deepEqual(t.DCM_BL_CENTER.features['DCM_CLK90->OMUX9'], ['7,28']);
  assert.deepEqual(t.DCM_TR_CENTER.features['DCM_CLK270->OMUX1'], ['6,63', '7,58']);
  for (const type of ['DCM_H_BL_CENTER', 'DCM_H_TL_CENTER', 'DCM_H_BR_CENTER', 'DCM_H_TR_CENTER']) assert.ok(Object.keys(t[type].features).some(k => k.includes('->')), type);
  // the CLKFX input range is its own feature, not CLKFX_DIVIDE 31 / 32's
  assert.deepEqual(d['DCM:CLKFX_DIVIDE:32'], ['-39,27', '-39,28', '-39,29', '-39,30', '-39,31']);
  // CLKIN_DIVIDE_BY_2 (#46): one bit, measured on the four DCMs of the XC3S250E, mirrored to the others
  assert.deepEqual(['DCM_TL_CENTER', 'DCM_TR_CENTER', 'DCM_BL_CENTER', 'DCM_BR_CENTER', 'DCM_H_BR_CENTER', 'DCM_H_BL_CENTER', 'DCM_H_TR_CENTER', 'DCM_H_TL_CENTER']
    .map(type => t[type].features['DCM:CLKIN_DIVIDE_BY_2:CLKIN_DIVIDE_BY_2']), [['0,112'], ['18,112'], ['0,-49'], ['18,-49'], ['0,112'], ['18,112'], ['0,-49'], ['18,-49']]);
  // CLKIN from a global buffer, CLKFX / CLKFX180 unused (#47): measured on every DCM of the four devices
  // (fix-25), in the database itself, the top-left one's mirrored
  assert.deepEqual(['DCM_TL_CENTER', 'DCM_BR_CENTER', 'DCM_H_BL_CENTER', 'DCM_H_TR_CENTER'].map(type => [t[type].features['DCM:CLKIN:GCLK'], t[type].features['DCM:DFS:OFF']]),
    [[['!0,100'], ['!-39,12', '!-39,43', '!-39,7']], [['!18,-37'], ['!57,20', '!57,51', '!57,56']], [['!18,100'], ['!57,12', '!57,43', '!57,7']], [['!0,-37'], ['!-39,20', '!-39,51', '!-39,56']]]);
  // the DCMs' own switches of #46's designs (learn-10): the outputs and the phase-shift / reset pins
  assert.deepEqual(t.DCM_TL_CENTER.features['DCM_CLK2X->OMUX3'], read('../measured/learn-10dcm46-pips.json').types.DCM_TL_CENTER.features['DCM_CLK2X->OMUX3']);
  assert.ok(Object.keys(read('../measured/learn-10dcm46-pips.json').types).every(type => /^DCM_(H_)?[TB][LR]_CENTER$/.test(type)));
});

test('gen-sitevar: variants with other values on each instance (perSite, #46); gen-dcmhdl: designs of several DCMs', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-sitevar-'));
  const tool = f => fileURLToPath(new URL(`../research/s3e-bitstream/${f}`, import.meta.url));
  try {
    const xdl = ['DCM_X0Y0', 'DCM_X1Y1', 'DCM_X1Y0'].map((s, i) => `inst "u${i}" "DCM",placed T${i} ${s} ,\n  cfg " CLKFX_DIVIDE::2 X_CLKIN_PERIOD::20.0 "\n  ;\n`).join('');
    fs.writeFileSync(path.join(dir, 'b.xdl'), xdl);
    fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ type: 'DCM', bases: { B: {} }, variants: [{ name: 'V00', base: 'B', perSite: { DCM_X0Y0: { X_CLKIN_PERIOD: '20.9', CLKFX_DIVIDE: '30' }, DCM_X1Y1: { X_CLKIN_PERIOD: null } } }] }));
    const r = spawnSync(process.execPath, [tool('gen-sitevar.mjs'), path.join(dir, 'b.xdl'), path.join(dir, 'out'), path.join(dir, 'spec.json')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const v = fs.readFileSync(path.join(dir, 'out', 'V00.xdl'), 'utf8').split('inst ').slice(1);
    assert.match(v[0], /CLKFX_DIVIDE::30 X_CLKIN_PERIOD::20\.9 /);
    assert.doesNotMatch(v[1], /X_CLKIN_PERIOD/);
    assert.match(v[2], /CLKFX_DIVIDE::2 X_CLKIN_PERIOD::20\.0 /, 'an instance not named keeps its values');
    fs.writeFileSync(path.join(dir, 'dcm.json'), JSON.stringify({ d2: { sites: ['DCM_X0Y1', 'DCM_X1Y1'], dcms: [{ P: 12.9, DIV2: true, DESKEW: 'SOURCE_SYNCHRONOUS' }, { M: 3, D: 30, P: 20.9 }] } }));
    const g = spawnSync(process.execPath, [tool('gen-dcmhdl.mjs'), dir, path.join(dir, 'dcm.json')], { encoding: 'utf8' });
    assert.equal(g.status, 0, g.stderr);
    const vhd = fs.readFileSync(path.join(dir, 'd2', 'top.vhd'), 'utf8');
    assert.match(vhd, /CLKIN_PERIOD => 12\.900,\s+CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => TRUE/);
    assert.match(vhd, /DESKEW_ADJUST => "SOURCE_SYNCHRONOUS"/);
    assert.match(vhd, /CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 30, CLKIN_PERIOD => 20\.900/);
    assert.equal((vhd.match(/: DCM_SP/g) || []).length, 2);
    assert.match(fs.readFileSync(path.join(dir, 'd2', 'top.ucf'), 'utf8'), /INST "u_dcm1" LOC = "DCM_X1Y1" ;/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('measured database: the global buffers of the left and right sides (#45)', () => {
  const t = read('s3e-tiles.json').types;
  for (const [T, x, sinv] of [['CLKL', 0, ['4,-20', '5,-62', '4,-21', '5,-61', '4,44', '5,2', '4,43', '5,3']], ['CLKR', 3, ['2,-20', '3,-62', '2,-21', '3,-61', '2,44', '3,2', '2,43', '3,3']]]) {
    const f = t[T].features;
    for (let k = 0; k < 8; k++) {
      // into, through and out of the buffers: no bits (the values of stage F were a pin left without its route)
      for (const p of [`${T}_GCLK${k}->${T}_GCLKIN0${k}`, `${T}_GCLK${k}->${T}_GCLKIN1${k ^ 1}`, `${T}_VCC_WIRE->${T}_SELDUB${k}`, `${T}_GCLK_PWO${k}->${T}_GCLKH_MAIN${k}`]) assert.deepEqual(f[p], [], `${T} ${p}`);
      // a select not inverted (a BUFGMUX switching): one bit per buffer, a BUFG's settings none
      const s = `BUFGMUX_X${x}Y${k + 2}`;
      assert.deepEqual(f[`${s}:SINV:S`], [sinv[k]], s);
      for (const a of ['USED', 'SINV:S_B', 'I0_USED:0', 'I1_USED:0', 'DISABLE_ATTR:LOW', 'GCLKMUX:', 'GCLK_BUFFER:']) assert.deepEqual(f[`${s}:${a}`], [], `${s}:${a}`);
    }
    // the inputs of the lines: one bit each
    assert.equal(Object.entries(f).filter(([k, v]) => /(IOIS_F\d_B3|OUT[TB]\d)->\w+_GCLK\d$/.test(k) && v.length === 1).length, 14);
  }
  assert.deepEqual(t.CLKR.features['CLKR_DN_IOIS_F4_B3->CLKR_GCLK7'], ['20,2']);
  // the centre tiles: every side line up and down, the same bits left and right
  for (const T of ['GCLKVML', 'GCLKVMR']) {
    const f = t[T].features;
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(k => f[`${T}_GCLKLR${k}->GCLKVMLR_GCLK_UP${k}`]), [['0,21'], ['0,23'], ['0,25'], ['0,27'], ['0,49'], ['0,52'], ['0,54'], ['0,56']]);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(k => f[`${T}_GCLKLR${k}->GCLKVMLR_GCLK_DN${k}`]), [['0,70'], ['0,73'], ['0,75'], ['0,77'], ['0,99'], ['0,102'], ['0,104'], ['0,106']]);
  }
});

test('measured database: SLICEM as RAM / shift register, I/O drive, slew and pull per pad', () => {
  const tiles = read('s3e-tiles.json');
  const f = tiles.types.CENTER_SMALL.features;
  assert.deepEqual(f['SLICE0:F:#RAM'], ['!1,50']);
  assert.deepEqual(f['SLICE1:G:#RAM:SHIFT_REG'], ['!1,25']);
  assert.deepEqual(f['SLICE0:WSGEN:'], ['1,46']);
  assert.equal(tiles.padDriveDefault.LVCMOS15, '8');
  // every pad of the package with an output: the drive, slew, pull and standard changes
  const pads = Object.values(read('xc3s250e-cp132-pads.json').padFeatures).filter(p => p['O:LVCMOS33']);
  assert.ok(pads.length > 80);
  for (const p of pads) for (const k of ['O:DRIVE:8', 'O:SLEW:FAST', 'O:PULL:PULLUP', 'O:LVTTL', 'O:LVTTL:DRIVE:8']) assert.ok(Array.isArray(p[k]), k);
});
