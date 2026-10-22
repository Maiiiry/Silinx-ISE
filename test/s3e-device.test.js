// research/s3e-device: measuring the device description black-box (no device report, no ISE here):
// the observation of ISE-routed nets, the join rules, the xdl2ncd probes, the DRC join tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wireFamily, tileXY, observeNet, observeDesign, resolveAmbiguous, joinRule } from '../research/s3e-device/observe.mjs';
import { switchGrid, gridRule, applyRules, closeRules, segmentRules, nodesOf } from '../research/s3e-device/model.mjs';
import { measuredLines, packMeasured } from '../research/s3e-device/build.mjs';
import { loadDevice, PIP_BIDI } from '../core/fpga/device.js';
import { probeXdl, probeFirstLine, parseProbeLog, sortPips, sortSites } from '../research/s3e-device/probe.mjs';
import { joinTestDesigns, parseJoinTests } from '../research/s3e-device/hypotheses.mjs';
import { rng, clbSlices, observeXdl } from '../research/s3e-device/gen-observe.mjs';
import { tileCandidates, siteCandidates, censusCandidates } from '../research/s3e-device/candidates.mjs';
import { bram, mult, pads } from '../research/s3e-device/gen-obshdl.mjs';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { parseXdl } from '../core/xdl.js';

test('wireFamily: doubles, hexes, long lines, output multiplexers, carry, clock, block-RAM pins', () => {
  assert.equal(wireFamily('E2BEG0'), 'seg:E2');
  assert.equal(wireFamily('E2END_S3'), 'seg:E2');
  assert.equal(wireFamily('N6MID1'), 'seg:N6');
  assert.equal(wireFamily('GCLKH_N6MID1'), 'seg:N6');      // a tile-type prefix
  assert.equal(wireFamily('W6D7'), 'seg:W6');
  assert.equal(wireFamily('LH18'), 'long:H');
  assert.equal(wireFamily('BRAMSITE20_LH20'), 'long:H');
  assert.equal(wireFamily('OMUX_NE12'), 'omux');
  assert.equal(wireFamily('NW_N'), 'omux');
  assert.equal(wireFamily('COUT_N1'), 'carry');
  assert.equal(wireFamily('CIN0'), 'carry');
  assert.equal(wireFamily('GCLKH_GCLK_UP4'), 'gclk');
  assert.equal(wireFamily('BRAM_DIA_B0_INT'), 'pin:BRAM_DIA_B0');
  assert.equal(wireFamily('BRAM_DIA_B0'), 'pin:BRAM_DIA_B0');
  for (const w of ['X0', 'F1_B_PINWIRE0', 'BX0', 'VCC_PINWIRE', 'IOIS_Y2', 'SR3']) assert.equal(wireFamily(w), null, w);
  assert.deepEqual(tileXY('CLB_X10Y7'), { prefix: 'CLB', x: 10, y: 7 });
  assert.deepEqual(tileXY('BRAM0_SMALL_BRK_X3Y25'), { prefix: 'BRAM0_SMALL_BRK', x: 3, y: 25 });
  assert.equal(tileXY('nope'), null);
});

// a net as ISE writes it: PIPs sorted by tile and wire, not as a path
const insts = new Map([
  ['a', { name: 'a', tile: 'CLB_X10Y10', site: 'SLICE_X18Y18' }],
  ['b', { name: 'b', tile: 'CLB_X12Y10', site: 'SLICE_X22Y18' }],
  ['c', { name: 'c', tile: 'CLB_X11Y10', site: 'SLICE_X20Y18' }],
]);
const net = {
  name: 'n', outpins: [{ inst: 'a', pin: 'X' }], inpins: [{ inst: 'b', pin: 'F1' }, { inst: 'c', pin: 'G2' }],
  pips: [
    { tile: 'CLB_X10Y10', from: 'OMUX3', dir: '->', to: 'E2BEG1' },
    { tile: 'CLB_X10Y10', from: 'X0', dir: '->', to: 'OMUX3' },
    { tile: 'CLB_X11Y10', from: 'E2MID1', dir: '->', to: 'G2_B0' },
    { tile: 'CLB_X11Y10', from: 'G2_B0', dir: '->', to: 'G2_B_PINWIRE0' },
    { tile: 'CLB_X12Y10', from: 'E2END1', dir: '->', to: 'F1_B0' },
    { tile: 'CLB_X12Y10', from: 'F1_B0', dir: '->', to: 'F1_B_PINWIRE0' },
  ],
};

test('observeNet: joins between tiles, the source and sink pin wires', () => {
  const r = observeNet(net, insts);
  assert.deepEqual(r.joins, [['CLB_X10Y10/E2BEG1', 'CLB_X11Y10/E2MID1'], ['CLB_X10Y10/E2BEG1', 'CLB_X12Y10/E2END1']]);
  assert.deepEqual(r.pins, [
    { site: 'SLICE_X18Y18', pin: 'X', dir: 'o', tile: 'CLB_X10Y10', wire: 'X0' },
    { site: 'SLICE_X22Y18', pin: 'F1', dir: 'i', tile: 'CLB_X12Y10', wire: 'F1_B_PINWIRE0' },
    { site: 'SLICE_X20Y18', pin: 'G2', dir: 'i', tile: 'CLB_X11Y10', wire: 'G2_B_PINWIRE0' },
  ]);
  assert.deepEqual(r.ambiguous, []);
  assert.deepEqual(r.unexplained, []);
});

test('observeNet: two candidates of the same family are ambiguous; a bidirectional PIP is turned round', () => {
  const n2 = {
    name: 'n2', outpins: [{ inst: 'a', pin: 'X' }], inpins: [],
    pips: [
      { tile: 'CLB_X10Y10', from: 'X0', dir: '->', to: 'OMUX3' },
      { tile: 'CLB_X10Y10', from: 'OMUX3', dir: '->', to: 'E2BEG1' },
      { tile: 'CLB_X10Y10', from: 'OMUX3', dir: '->', to: 'E2BEG3' },
      { tile: 'CLB_X11Y10', from: 'E2MID1', dir: '->', to: 'BX0' },
      { tile: 'CLB_X11Y10', from: 'BY1', dir: '=-', to: 'BX0' },   // written BY1 =- BX0, carries BX0 to BY1
    ],
  };
  const r = observeNet(n2, insts);
  assert.deepEqual(r.joins, []);
  assert.deepEqual(r.ambiguous, [{ from: 'CLB_X11Y10/E2MID1', candidates: ['CLB_X10Y10/E2BEG1', 'CLB_X10Y10/E2BEG3'] }]);
  assert.deepEqual(r.unexplained, []);
  // the join seen elsewhere at the same offset decides
  const known = [['CLB_X3Y3/E2BEG1', 'CLB_X4Y3/E2MID1']];
  assert.equal(joinRule(...known[0]), 'CLB/E2BEG1 1,0 CLB/E2MID1');
  assert.deepEqual(resolveAmbiguous(r.ambiguous, known), { joins: [['CLB_X10Y10/E2BEG1', 'CLB_X11Y10/E2MID1']], ambiguous: [] });
});

test('observeDesign: sites and PIPs of a parsed XDL design', () => {
  const xdl = `design "d" xc3s250ecp132-4 v3.2 ;
inst "a" "SLICEL", placed CLB_X10Y10 SLICE_X18Y18 , cfg " " ;
inst "b" "SLICEL", placed CLB_X12Y10 SLICE_X22Y18 , cfg " " ;
net "n" , outpin "a" X , inpin "b" F1 ,
  pip CLB_X10Y10 X0 -> OMUX3 , pip CLB_X10Y10 OMUX3 -> E2BEG1 ,
  pip CLB_X12Y10 E2END1 -> F1_B0 , pip CLB_X12Y10 F1_B0 -> F1_B_PINWIRE0 , ;
`;
  const o = observeDesign(parseXdl(xdl));
  assert.deepEqual(o.sites, [{ site: 'SLICE_X18Y18', tile: 'CLB_X10Y10', type: 'SLICEL' }, { site: 'SLICE_X22Y18', tile: 'CLB_X12Y10', type: 'SLICEL' }]);
  assert.equal(o.pips.length, 4);
  assert.deepEqual(o.joins, [['CLB_X10Y10/E2BEG1', 'CLB_X12Y10/E2END1']]);
  assert.equal(o.pins.length, 2);
});

test('switch-box grid: offsets counted in switch boxes of the row, then of the column', () => {
  // a row with a block-RAM column (one switch box at X3, none at X4-X6), a row of CLBs above it,
  // and a column interrupted (no switch box at X7Y2)
  const tiles = ['CLB_X1Y1', 'CLB_X2Y1', 'BRAM0_SMALL_X3Y1', 'CLB_X7Y1', 'CLB_X8Y1',
    'CLB_X1Y2', 'CLB_X2Y2', 'CLB_X3Y2', 'CLB_X4Y2', 'CLB_X8Y2', 'CLB_X7Y3'];
  const g = switchGrid(tiles);
  assert.deepEqual(g.rowXs.get(1), [1, 2, 3, 7, 8]);
  assert.deepEqual(g.colYs.get(7), [1, 3]);
  assert.equal(gridRule('CLB_X2Y1/E2BEG0', 'CLB_X7Y1/E2END0', g), 'E2BEG0 2,0 E2END0');
  assert.equal(gridRule('CLB_X7Y1/N2BEG0', 'CLB_X7Y3/N2MID0', g), 'N2BEG0 0,1 N2MID0');
  assert.equal(gridRule('CLB_X2Y1/E2BEG0', 'CLB_X4Y2/E2END0', g), null);   // no switch box at X4 in row 1
  assert.throws(() => switchGrid(['CLB_X1Y1', 'LIOIS_X1Y1']), /two switch boxes at X1Y1/);
  const wires = t => new Set(t.startsWith('BRAM') ? ['E2MID0'] : ['E2BEG0', 'E2MID0', 'E2END0']);
  const got = applyRules(['E2BEG0 1,0 E2MID0', 'E2BEG0 2,0 E2END0'], g, wires).map(j => j.join(' ')).sort();
  // (CLB_X1Y1's E2END0 would be in BRAM0_SMALL_X3Y1, whose wires here have no E2END0)
  assert.deepEqual(got, [
    'CLB_X1Y1/E2BEG0 CLB_X2Y1/E2MID0',
    'CLB_X1Y2/E2BEG0 CLB_X2Y2/E2MID0', 'CLB_X1Y2/E2BEG0 CLB_X3Y2/E2END0',
    'CLB_X2Y1/E2BEG0 BRAM0_SMALL_X3Y1/E2MID0', 'CLB_X2Y1/E2BEG0 CLB_X7Y1/E2END0',
    'CLB_X2Y2/E2BEG0 CLB_X3Y2/E2MID0', 'CLB_X2Y2/E2BEG0 CLB_X4Y2/E2END0',
    'CLB_X3Y2/E2BEG0 CLB_X4Y2/E2MID0', 'CLB_X3Y2/E2BEG0 CLB_X8Y2/E2END0',
    'CLB_X4Y2/E2BEG0 CLB_X8Y2/E2MID0',
    'CLB_X7Y1/E2BEG0 CLB_X8Y1/E2MID0',
  ].sort());
  const nodes = nodesOf([['a/1', 'b/1'], ['b/1', 'c/1'], ['d/1', 'e/1']]);
  assert.equal(nodes.get('c/1'), 'a/1');
  assert.equal(nodes.get('e/1'), 'd/1');
});

test('closeRules: the wires one wire is joined to are joined to each other', () => {
  assert.deepEqual([...closeRules(['E2BEG0 1,0 E2MID0', 'E2BEG0 2,0 E2END0'])].sort(), [
    'E2BEG0 1,0 E2MID0', 'E2BEG0 2,0 E2END0', 'E2END0 -1,0 E2MID0', 'E2END0 -2,0 E2BEG0',
    'E2MID0 -1,0 E2BEG0', 'E2MID0 1,0 E2END0',
  ]);
});

test('segmentRules: the taps of doubles and hexes from their names', () => {
  const r = [...segmentRules([3])];
  assert.equal(r.length, 4 * (4 + 8));   // per direction: a double's 2 taps + END_S / END_N, a hex's 6 + 2
  for (const x of ['E2BEG3 1,0 E2MID3', 'E2BEG3 2,0 E2END3', 'E2BEG3 2,-1 E2END_S3', 'W2BEG3 -2,1 W2END_N3',
    'N6BEG3 0,1 N6A3', 'N6BEG3 0,3 N6MID3', 'N6BEG3 0,6 N6END3', 'N6BEG3 0,7 N6END_N3', 'S6BEG3 0,-5 S6D3']) assert.ok(r.includes(x), x);
});

test('packMeasured: measurements in the packed format of the shipped graphs', () => {
  const type = {
    wires: ['E2BEG0', 'E2END0', 'F1_B0', 'F1_B_PINWIRE0', 'OMUX0', 'X0'],
    pips: [['X0', 'OMUX0'], ['OMUX0', 'E2BEG0'], ['E2END0', 'F1_B0'], ['F1_B0', 'F1_B_PINWIRE0'], ['F1_B0', 'X0', PIP_BIDI]],
    sites: [{ type: 'SLICEL', pins: [['F1', 'i', 'F1_B_PINWIRE0'], ['X', 'o', 'X0']] }],
  };
  const m = {
    part: 'xc3s250ecp132-4', types: { CENTER_SMALL: type },
    tiles: [{ name: 'CLB_X1Y1', type: 'CENTER_SMALL', sites: [['SLICE_X0Y0', 0]] }, { name: 'CLB_X3Y1', type: 'CENTER_SMALL', sites: [['SLICE_X4Y0', 0]] }],
    joins: [['CLB_X1Y1/E2BEG0', 'CLB_X3Y1/E2END0']],
  };
  const lines = [...measuredLines(m)];
  assert.equal(lines[0], '(xdl_resource_report v0.2 xc3s250ecp132-4 spartan3e');
  assert.ok(lines.includes('(conn CLB_X3Y1 E2END0)') && lines.includes('(pip CLB_X1Y1 F1_B0 =- X0)'));
  const p = packMeasured(m);
  assert.deepEqual(p.counts, { tiles: 2, wires: 12, pips: 10, nodes: 11, templates: 1 });
  const d = loadDevice(JSON.parse(JSON.stringify(p)));
  assert.equal(d.node('CLB_X1Y1', 'E2BEG0'), d.node('CLB_X3Y1', 'E2END0'));
  assert.notEqual(d.node('CLB_X1Y1', 'E2END0'), d.node('CLB_X3Y1', 'E2BEG0'));
  assert.deepEqual(d.sitePin('SLICE_X4Y0', 'F1'), { tile: 1, tileName: 'CLB_X3Y1', wire: 'F1_B_PINWIRE0', wireId: d.wireId(1, 'F1_B_PINWIRE0'), dir: 'i' });
  assert.equal(d.site('SLICE_X0Y0').type, 'SLICEL');
  assert.ok(d.pipIsBidi(0, d.findPip(0, 'F1_B0', 'X0')));
  // rows from the top, columns by tile X
  assert.deepEqual([d.tileRow[0], d.tileCol[0], d.tileRow[1], d.tileCol[1]], [0, 1, 0, 3]);
  assert.throws(() => packMeasured({ ...m, tiles: [{ name: 'CLB_X1Y1', type: 'NOPE', sites: [] }] }), /no measured type NOPE for CLB_X1Y1/);
});

test('probe designs: candidates, their lines, and what xdl -xdl2ncd says', () => {
  const pips = [{ tile: 'CLB_X1Y1', from: 'W2END4', to: 'W2BEG4' }, { tile: 'CLB_X3Y5', from: 'W2END4', to: 'W2BEG4' }, { tile: 'CLB_X1Y2', from: 'W2END4', to: 'W2BEG4' }];
  const sites = [{ site: 'SLICE_X0Y0', type: 'SLICEL' }, { site: 'SLICE_X99Y9', type: 'SLICEL' }];
  const text = probeXdl('xc3s250ecp132-4', { pips, sites });
  const lines = text.split('\n');
  const first = probeFirstLine({ sites });
  assert.equal(lines[first - 1], '  pip CLB_X1Y1 W2END4 -> W2BEG4 ,');
  assert.equal(lines[2 + 2 * 2 - 1], 'inst "p1" "SLICEL", placed TILE SLICE_X99Y9 ,');
  assert.match(lines[0], /^design "probe" xc3s250ecp132-4 v3\.2 ;$/);
  assert.ok(parseXdl(text).nets[0].pips.length === 3);
  const log = `ERROR:XDL:190 - Placement site SLICE_X99Y9 for instance p1 of type SLICEL around line ${2 + 2 * 2} of file p.xdl is invalid for device.
ERROR:XDL:198 - Could not find arc in tile CLB_X3Y5 with connecting wires W2END4 and W2BEG4 around line ${first + 1} of file p.xdl.
INFO:XDL:186 - 2 error(s) were found in XDL file. The NCD file cannot be created.`;
  const p = parseProbeLog(log);
  assert.deepEqual([...p.badArcs], ['CLB_X3Y5 W2END4 W2BEG4']);
  assert.deepEqual([...p.badSites], ['SLICE_X99Y9']);
  assert.equal(p.stoppedAtLine, null);
  assert.deepEqual(sortPips(pips, first, p), { yes: [pips[0], pips[2]], no: [pips[1]], again: [] });
  assert.deepEqual(sortSites(sites, p), { yes: [sites[0]], no: [sites[1]], again: [] });
  // stopped after 20 errors: what comes after the last error is asked again
  const stopped = parseProbeLog(`ERROR:XDL:198 - Could not find arc in tile CLB_X3Y5 with connecting wires W2END4 and W2BEG4 around line ${first + 1} of file p.xdl.
INFO:XDL:185 - XDL file processing stopped after 20 errors were found.  The NCD file cannot be created.`);
  assert.equal(stopped.stoppedAtLine, first + 1);
  assert.deepEqual(sortPips(pips, first, stopped), { yes: [pips[0]], no: [pips[1]], again: [pips[2]] });
  // a sentinel PIP after the candidates; a fatal error of xdl's own: answered up to its last error,
  // or all of them when the sentinel's error is there
  const st = probeXdl('xc3s250ecp132-4', { pips, sites, sentinel: true }).split('\n');
  assert.equal(st[first + pips.length - 1], '  pip CLB_X1Y1 PROBE_END -> PROBE_END ,');
  const fatal = 'FATAL_ERROR:XCad:XCad_RMed.c:399:1.101 - UNEXPECTED RUG CREATION PROBLEM FOR NETWORK:probe';
  const arc = line => `ERROR:XDL:198 - Could not find arc in tile CLB_X3Y5 with connecting wires W2END4 and W2BEG4 around line ${line} of file p.xdl.`;
  const f1 = parseProbeLog(`${arc(first + 1)}\n${fatal}`, { sentinelLine: first + 3 });
  assert.equal(f1.fatal, true);
  assert.deepEqual(sortPips(pips, first, f1), { yes: [pips[0]], no: [pips[1]], again: [pips[2]] });
  assert.deepEqual(sortPips(pips, first, parseProbeLog(fatal, { sentinelLine: first + 3 })), { yes: [], no: [], again: pips });
  const f2 = parseProbeLog(`${arc(first + 1)}\n${arc(first + 3).replace('W2END4 and W2BEG4', 'PROBE_END and PROBE_END')}\n${fatal}`, { sentinelLine: first + 3 });
  assert.deepEqual(sortPips(pips, first, f2), { yes: [pips[0], pips[2]], no: [pips[1]], again: [] });
});

test('join tests: one net per hypothesis, from a slice output through the tile to the tested wire', () => {
  const pipsOf = () => [['X0', 'OMUX3'], ['OMUX3', 'E2BEG1'], ['Y0', 'OMUX5'], ['OMUX5', 'N2BEG1'], ['E2MID1', 'G2_B0'], ['N2MID1', 'F1_B0']];
  const slicesOf = t => t === 'CLB_X10Y10' ? [{ site: 'SLICE_X18Y18', pos: 0 }] : [];
  const pinWire = (pos, pin) => `${pin}${pos}`;
  const joins = [['CLB_X10Y10/E2BEG1', 'CLB_X11Y10/E2MID1'], ['CLB_X11Y10/N2MID1', 'CLB_X10Y10/N2BEG1'], ['CLB_X12Y10/E2MID1', 'CLB_X13Y10/E2BEG1']];
  const r = joinTestDesigns({ part: 'xc3s250ecp132-4', joins, slicesOf, pinWire, pipsOf });
  assert.deepEqual(r.untestable, [joins[2]]);   // no slice in either tile drives it
  assert.equal(r.designs.length, 1);
  assert.deepEqual(r.designs[0].tests, [{ net: 'h0', join: joins[0] }, { net: 'h1', join: joins[1] }]);
  const d = parseXdl(r.designs[0].xdl);
  assert.deepEqual(d.nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`), ['CLB_X10Y10 X0 OMUX3', 'CLB_X10Y10 OMUX3 E2BEG1', 'CLB_X11Y10 E2MID1 G2_B0']);
  assert.deepEqual(d.nets[1].outpins, [{ inst: 's_SLICE_X18Y18', pin: 'Y' }]);
  assert.deepEqual(d.nets[1].pips.map(p => `${p.tile} ${p.from} ${p.to}`), ['CLB_X10Y10 Y0 OMUX5', 'CLB_X10Y10 OMUX5 N2BEG1', 'CLB_X11Y10 N2MID1 F1_B0']);
  // a second hypothesis on the same source pin waits for the next design
  const r2 = joinTestDesigns({ part: 'xc3s250ecp132-4', joins: [joins[0], ['CLB_X10Y10/E2BEG1', 'CLB_X12Y10/E2MID1']], slicesOf, pinWire, pipsOf: () => [...pipsOf(), ['E2MID1', 'F2_B0']] });
  assert.equal(r2.designs.length, 2);
});

test('join tests: a wire only an I/O or block-RAM site drives, tested from that site (an IOB\'s input, a block RAM\'s output) (#3)', () => {
  // the I/O tile's OMUX0 and E2BEG0 are driven only from its IOB's I (IOIS_I0); the block-RAM tile's E2BEG1 only
  // from the block RAM's DOA3: no slice reaches them, so the joins out of them were untestable (step 1's 3388)
  const pips = {
    LIOIS_X0Y10: [['IOIS_I0', 'OMUX0'], ['OMUX0', 'E2BEG0']],
    BRAM0_SMALL_X7Y10: [['BRAM_DOA3', 'OMUX1'], ['OMUX1', 'E2BEG1']],
    CLB_X1Y10: [['E2MID0', 'F1_B0']], CLB_X8Y10: [['E2MID1', 'G3_B0']],
  };
  const pipsOf = t => pips[t] || [];
  const slicesOf = () => [];
  const pinWire = (pos, pin) => `${pin}${pos}`;
  const joins = [['LIOIS_X0Y10/E2BEG0', 'CLB_X1Y10/E2MID0'], ['BRAM0_SMALL_X7Y10/E2BEG1', 'CLB_X8Y10/E2MID1']];
  const part = 'xc3s250ecp132-4';
  assert.deepEqual(joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf }).untestable, joins);
  const src = { LIOIS_X0Y10: [{ site: 'D2', type: 'IOB', o: 'I', wire: 'IOIS_I0' }], BRAM0_SMALL_X7Y10: [{ site: 'RAMB16_X0Y1', type: 'RAMB16', o: 'DOA3', wire: 'BRAM_DOA3' }] };
  const r = joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, sourcesOf: t => src[t] || [] });
  assert.deepEqual(r.untestable, []);
  assert.deepEqual(r.designs.map(d => d.tests.map(t => t.join)), [joins]);
  const d = parseXdl(r.designs[0].xdl);
  assert.deepEqual(d.insts.map(i => `${i.name} ${i.type} ${i.site}`), ['s_D2 IOB D2', 's_RAMB16_X0Y1 RAMB16 RAMB16_X0Y1']);
  // the IOB's input from its pad, no register; the net: the site's output, no sink of its own
  assert.ok(d.insts[0].cfg.some(c => c.attr === 'IMUX' && c.value === '1') && d.insts[0].cfg.some(c => c.attr === 'PAD'));
  assert.deepEqual([d.nets[0].outpins, d.nets[0].inpins], [[{ inst: 's_D2', pin: 'I' }], []]);
  assert.deepEqual(d.nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`), ['LIOIS_X0Y10 IOIS_I0 OMUX0', 'LIOIS_X0Y10 OMUX0 E2BEG0', 'CLB_X1Y10 E2MID0 F1_B0']);
  assert.deepEqual(d.nets[1].outpins, [{ inst: 's_RAMB16_X0Y1', pin: 'DOA3' }]);
  // an input-only pad: an IBUF site, the instance of its own type in its own tile (xdl -xdl2ncd refuses an IOB there:
  // ERROR:XDL:190, the first ISE run of these tests); likewise the block RAM's tile
  const src2 = { LIOIS_X0Y10: [{ site: 'E2', type: 'IOB', siteType: 'IBUF', tile: 'LIBUFS_X0Y10', o: 'I', wire: 'IOIS_I0' }],
    BRAM0_SMALL_X7Y10: [{ site: 'RAMB16_X0Y1', type: 'RAMB16', siteType: 'RAMB16', tile: 'BRAMSITE_X7Y10', o: 'DOA3', wire: 'BRAM_DOA3' }] };
  const x2 = joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, sourcesOf: t => src2[t] || [] }).designs[0].xdl;
  assert.match(x2, /^inst "s_E2" "IBUF", placed LIBUFS_X0Y10 E2 ,$/m);
  assert.match(x2, /^inst "s_RAMB16_X0Y1" "RAMB16", placed BRAMSITE_X7Y10 RAMB16_X0Y1 ,$/m);
});

test('join tests: a tile with no slice is driven from a neighbouring CLB across a known join', () => {
  // the I/O tile LIOIS_X0Y10 has no slice: its W2MID1 is reached from the CLB's W2BEG1 (a known join)
  const pips = {
    CLB_X1Y10: [['X0', 'OMUX3'], ['OMUX3', 'W2BEG1'], ['Y0', 'OMUX5'], ['OMUX5', 'W2BEG1'], ['E2MID2', 'G2_B0'], ['E2MID3', 'F1_B0'], ['OMUX3', 'N2BEG0']],
    LIOIS_X0Y10: [['W2MID1', 'E2BEG2'], ['W2MID1', 'E2BEG3']],
  };
  const pipsOf = t => pips[t] || [];
  const slicesOf = t => t === 'CLB_X1Y10' ? [{ site: 'SLICE_X0Y18', pos: 0 }] : [];
  const pinWire = (pos, pin) => `${pin}${pos}`;
  const known = new Map([['CLB_X1Y10/W2BEG1', ['LIOIS_X0Y10/W2MID1']], ['LIOIS_X0Y10/W2MID1', ['CLB_X1Y10/W2BEG1']]]);
  const joined = k => known.get(k) || [];
  const joins = [['LIOIS_X0Y10/E2BEG2', 'CLB_X1Y10/E2MID2'], ['CLB_X1Y10/E2MID3', 'LIOIS_X0Y10/E2BEG3']];
  const part = 'xc3s250ecp132-4';
  // without crossing joins (the default) the I/O tile cannot be driven
  assert.deepEqual(joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, joined }).untestable, joins);
  const r = joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, joined, maxJoins: 1 });
  assert.deepEqual(r.untestable, []);
  // both tests need the node CLB_X1Y10/W2BEG1 = LIOIS_X0Y10/W2MID1: one per design
  assert.deepEqual(r.designs.map(d => d.tests), [[{ net: 'h0', join: joins[0] }], [{ net: 'h0', join: joins[1] }]]);
  const d = parseXdl(r.designs[0].xdl);
  assert.deepEqual(d.nets[0].outpins, [{ inst: 's_SLICE_X0Y18', pin: 'X' }]);
  assert.deepEqual(d.nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`),
    ['CLB_X1Y10 X0 OMUX3', 'CLB_X1Y10 OMUX3 W2BEG1', 'LIOIS_X0Y10 W2MID1 E2BEG2', 'CLB_X1Y10 E2MID2 G2_B0']);
  // the tested join reversed (the I/O tile's end is the one driven): the same path
  assert.equal(parseXdl(r.designs[1].xdl).nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`).join(', '),
    'CLB_X1Y10 X0 OMUX3, CLB_X1Y10 OMUX3 W2BEG1, LIOIS_X0Y10 W2MID1 E2BEG3, CLB_X1Y10 E2MID3 F1_B0');
  // a path never crosses the other end of the tested join (it would join the two ends by itself):
  // the known join tested again cannot be driven from the I/O tile's side, and the CLB's side has
  // no PIP out of the I/O tile's wire
  const self = [['LIOIS_X0Y10/W2MID1', 'CLB_X1Y10/W2BEG1']];
  const pips2 = { ...pips, LIOIS_X0Y10: [], CLB_X1Y10: [...pips.CLB_X1Y10, ['W2BEG1', 'F2_B0']] };
  assert.deepEqual(joinTestDesigns({ part, joins: self, slicesOf, pinWire, pipsOf: t => pips2[t] || [], joined, maxJoins: 1 }).untestable, self);
  // maxDepth limits the PIPs of the path: the I/O tile's E2BEG2 is three PIPs and a join from the slice
  assert.deepEqual(joinTestDesigns({ part, joins: [joins[0]], slicesOf, pinWire, pipsOf, joined, maxJoins: 1, maxDepth: 2 }).untestable, [joins[0]]);
});

test('parseJoinTests: an island means no join; antennas and unrouted sinks are expected', () => {
  const log = `ERROR:PhysDesignRules:798 - The network <h0> has an antenna. Routing is
   incomplete.
ERROR:PhysDesignRules:798 - The network <h1> has an antenna. Routing is
   incomplete.
ERROR:PhysDesignRules:799 - The network <h1> has island(s). Routing is
   incomplete.
ERROR:PhysDesignRules:9 - The network <h2> is only partially routed.
ERROR:PhysDesignRules:1712 - The network <h3> has a routing conflict with
   resouce DOUBLE(-12096,-31261).
ERROR:PhysDesignRules:1713 - The network <h4> has a routing conflict with
   resource DOUBLE(-8640,-31261) driven by routing switch
   OUTPUT(-10928,-32728)--->DOUBLE(-8640,-31261).
ERROR:PhysDesignRules:799 - The network <h4> has island(s). Routing is
   incomplete.
ERROR:PhysDesignRules:1234 - The network <h6> has something else.`;
  assert.deepEqual([...parseJoinTests(log, ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])],
    [['h0', 'join'], ['h1', 'no-join'], ['h2', 'join'], ['h3', 'join'], ['h4', 'no-join'], ['h5', 'join'], ['h6', 'unclear']]);
});

test('candidates: tiles of the observed prefixes, slice and VCC sites, the census of the CLBs', () => {
  const t = tileCandidates(['CLB_X1Y1', 'CLB_X2Y2', 'LIOIS_X0Y1', 'BRAM0_SMALL_X2Y1', 'GCLKH_X1Y1', 'TIOIS_X1Y3', 'CLB_X3Y1']);
  // CLBs inside (1..2 x 1..2), I/O tiles on their side, block-RAM interconnect in its column only
  assert.deepEqual(t.pips.map(p => p.tile).sort(), ['BRAM0_SMALL_X2Y2', 'CLB_X1Y2', 'CLB_X2Y1', 'LIOIS_X0Y0', 'LIOIS_X0Y2', 'LIOIS_X0Y3', 'TIOIS_X0Y3', 'TIOIS_X2Y3', 'TIOIS_X3Y3']);
  assert.deepEqual(t.pips[0], { tile: t.pips[0].tile, from: 'W2END4', to: 'W2BEG4' });
  assert.deepEqual(t.known.sort(), ['BRAM0_SMALL_X2Y1', 'CLB_X1Y1', 'CLB_X2Y2', 'CLB_X3Y1', 'LIOIS_X0Y1', 'TIOIS_X1Y3']);
  const s = siteCandidates(['CLB_X1Y1']);
  assert.deepEqual(s.slice(0, 4).map(x => `${x.site}:${x.type}`), ['SLICE_X0Y0:SLICEM', 'SLICE_X0Y1:SLICEM', 'SLICE_X1Y0:SLICEM', 'SLICE_X1Y1:SLICEM']);
  assert.equal(s.length, 4 + 4 * 5);   // VCC_X0..3 Y0..4
  const db = { types: { CENTER_SMALL: { features: { 'X0->OMUX0': ['1,1'], 'BX0->BY1': [], 'CLKINV:CLK': [] } }, CENTER_SMALL_BRK: { sameAs: 'CENTER_SMALL', features: { 'GCLK0_BRK->CLK0': [] } } } };
  assert.deepEqual(censusCandidates(['CLB_X1Y1', 'CLB_X1Y9'], db, [9]).map(p => `${p.tile} ${p.from} ${p.dir} ${p.to}`), [
    'CLB_X1Y1 X0 -> OMUX0', 'CLB_X1Y1 BX0 =- BY1', 'CLB_X1Y9 GCLK0_BRK -> CLK0', 'CLB_X1Y9 X0 -> OMUX0', 'CLB_X1Y9 BX0 =- BY1',
  ]);
});

test('gen-observe: seeded random designs over the CLB slices', () => {
  const a = rng(7), b = rng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.deepEqual(clbSlices('CLB_X10Y10'), ['SLICE_X18Y18', 'SLICE_X18Y19', 'SLICE_X19Y18', 'SLICE_X19Y19']);
  const text = observeXdl('xc3s250ecp132-4', ['CLB_X1Y1', 'CLB_X2Y1', 'CLB_X9Y9'], 3);
  assert.equal(text, observeXdl('xc3s250ecp132-4', ['CLB_X1Y1', 'CLB_X2Y1', 'CLB_X9Y9'], 3));
  const d = parseXdl(text);
  assert.equal(d.insts.length, 12);
  const sinks = d.nets.flatMap(n => n.inpins);
  assert.equal(sinks.length, 12 * 8);   // every LUT input driven once
  assert.equal(new Set(sinks.map(p => `${p.inst}.${p.pin}`)).size, 96);
  assert.ok(d.nets.every(n => n.outpins.length === 1 && n.pips.length === 0));
});

test('gen-obshdl: observation designs with every block RAM, every multiplier, the pads, each LOC\'d where it must be, read by Silinx\'s front end (#3, round 5)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  // (no error and no warning, from compile or elaboration)
  const read = v => { const srcs = [{ path: 'top.v', lang: 'verilog', text: v }]; const lib = compile([...primitiveSources(srcs), ...srcs]); return [lib.errors, elaborate(lib, 'top').diags]; };
  const b = bram(dev, 'xc3s250ecp132-4'), m = mult(dev, 'xc3s250ecp132-4'), p = pads(90, 24, 'xc3s250ecp132-4');
  // every site of the device, once
  const locs = ucf => [...ucf.matchAll(/^INST "u(\d+)" LOC = "(\S+)" ;$/gm)].map(x => x[2]);
  assert.deepEqual(locs(b.ucf).sort(), dev.sites('RAMB16').map(s => s.name).sort());
  assert.deepEqual(locs(m.ucf).sort(), dev.sites('MULT18X18SIO').map(s => s.name).sort());
  assert.equal(locs(b.ucf).length, 12);
  assert.equal(p.ucf, '', 'the pads placed by ISE');
  // each output of each block RAM / multiplier into a register (18 per RAM, 36 per multiplier)
  assert.equal((b.v.match(/r\d+\[\d+\]/g) || []).length, 12 * 18);
  assert.equal((m.v.match(/r\d+\[\d+\]/g) || []).length, 12 * 36);
  // 90 pads: the clock, 24 inputs, 65 bidirectional
  assert.match(p.v, /module top\(input clk, input \[23:0\] i, inout \[64:0\] p\);/);
  for (const v of [b.v, m.v, p.v]) assert.deepEqual(read(v), [[], []]);
});
