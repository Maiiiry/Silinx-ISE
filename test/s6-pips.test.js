// research/s6 stage S6-D (#726), without ISE: gen-pipprobe6.mjs's designs (one PIP per INT tile, on a net of the
// tile's TIEOFF) and ana-pipprobe6.mjs's analysis (a tile's bits, a PIP's bits the same in every tile).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { intTiles, probePips, probeXdl, probePins } from '../research/s6/gen-pipprobe6.mjs';
import { intRegion, regionBits, pipBits } from '../research/s6/ana-pipprobe6.mjs';
import { S6_DEVICES, emptyFdri, FRAME_WORDS } from '../core/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const { device, sites } = s6Device('xc6slx16csg324-3');

test('gen-pipprobe6: the INT tiles next to a CLB, a PIP each in turn, the designs\' XDL', () => {
  const tiles = intTiles(device);
  assert.equal(tiles.length, 1083);
  assert.ok(tiles.every(k => device.tileType(k) === 'INT'));
  const pips = probePips(device, tiles.slice(0, 3), 100);
  assert.deepEqual(Object.values(pips).map(p => p.to).length, 3);
  const k = tiles[1], p = device.pip(k, 101);
  assert.deepEqual(pips[device.tileNames[k]], { from: p.from, dir: p.dir, to: p.to });
  const one = { INT_X17Y15: { from: 'EE2E3', dir: '->', to: 'LOGICIN_B31' } };
  assert.equal(probeXdl('p', one), 'design "pips" p v3.2 ,\n  cfg "";\nnet "probe" , \n  pip INT_X17Y15 EE2E3 -> LOGICIN_B31 ,\n  ;\n');
  const pins = probePins(device, [device.tile('INT_X17Y15')]);
  assert.deepEqual(pins, { INT_X17Y15: { tieoff: 'TIEOFF_X31Y30', slice: 'SLICE_X28Y15', type: 'SLICEL', tile: 'CLEXL_X17Y15' } });
  assert.equal(probeXdl('p', one, { pins, inpin: false }), 'design "pips" p v3.2 ,\n  cfg "";\n'
    + 'inst "t_INT_X17Y15" "TIEOFF",placed INT_X17Y15 TIEOFF_X31Y30  ,\n  cfg "" ;\n'
    + 'net "probe0" , \n  outpin "t_INT_X17Y15" HARD1 ,\n  pip INT_X17Y15 EE2E3 -> LOGICIN_B31 ,\n  ;\n');
  assert.match(probeXdl('p', one, { pins, withPips: false }), /inpin "s_INT_X17Y15" A1 ,\n {2};\n$/);
});

test('ana-pipprobe6: an INT tile\'s region, its bits; a PIP\'s bits checked between tiles', () => {
  const dev = S6_DEVICES.xc6slx16, bases = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-lut.json', import.meta.url), 'utf8')).slices;
  assert.deepEqual(intRegion(sites, bases, dev, 'INT_X17Y15'), [511, 0]);
  assert.equal(intRegion(sites, bases, dev, 'INT_X99Y0'), null);
  const empty = emptyFdri(dev), fdri = Uint16Array.from(empty), set = (f, b) => { fdri[f * FRAME_WORDS + (b >> 4)] |= 0x8000 >> (b & 15); };
  set(511 + 6, 61); set(511 + 21, 3); set(511 + 2, 64);
  assert.deepEqual(regionBits(fdri, empty, [511, 0]), [[6, 61]]);
  const r = pipBits([{ pips: { A: 'a -> b', B: 'c -> d' }, bits: { A: [[6, 61]], B: [] } }, { pips: { C: 'a -> b', D: 'c -> d' }, bits: { C: [[6, 61]], D: [[1, 2]] } }]);
  assert.deepEqual(r.pips, { 'a -> b': [[6, 61]], 'c -> d': [] });
  assert.deepEqual(r.tiles, { 'a -> b': 2, 'c -> d': 1 });
  assert.deepEqual(r.problems, ['c -> d: [] and [[1,2]] (D)']);
});

test('gen-pipcover6: a target PIP either way, a path to it from a driver; ana: its tile\'s bits less the paths\'', async () => {
  const { findTarget, findPath, coverDesign } = await import('../research/s6/gen-pipcover6.mjs');
  const { coverBits } = await import('../research/s6/ana-pipprobe6.mjs');
  const k = device.tile('INT_X12Y34');
  assert.deepEqual(findTarget(device, k, 'SR1E1', 'SR1B2'), { i: device.findPip(k, 'SR1E1', 'SR1B2'), from: 'SR1E1', to: 'SR1B2', text: 'SR1E1 -> SR1B2' });
  // a bidirectional PIP the other way
  assert.equal(findTarget(device, k, 'LOGICIN_B51', 'GFAN1').text, 'GFAN1 =- LOGICIN_B51');
  assert.equal(findTarget(device, k, 'SR1B2', 'SR1E1'), null);
  // SR1E1 is the single SR1B1 of the tile above: a slice output there drives it
  const n = device.node(k, 'SR1E1'), up = device.tile('INT_X12Y35');
  const src = { inst: 's', pin: 'A', node: device.sitePinNode('SLICE_X18Y35', 'A') };
  const p = findPath(device, [src], n, { near: kk => [k, up, device.tile('CLEXM_X12Y35'), device.tile('CLEXL_X12Y35')].includes(kk), used: new Set() });
  assert.ok(p && p.pips.length >= 2 && device.pipNodes(p.pips.at(-1).k, p.pips.at(-1).i)[1] === n);
  const { key, missed } = coverDesign(device, 'xc6slx16csg324-3', ['SR1E1 -> SR1B2', 'LOGICIN_B51 -> GFAN1']);
  assert.deepEqual(missed, []);
  assert.deepEqual(Object.values(key).map(x => x.pip), ['SR1E1 -> SR1B2', 'GFAN1 =- LOGICIN_B51']);
  // the target tile's bits less every path's PIPs in it (known bits), the unknown ones reported
  const r = coverBits({ T: { pip: 'a -> b', signal: 'a -> b', path: ['T x -> a', 'U y -> z'] }, V: { pip: 'c -> d', signal: 'c -> d', path: ['T q -> r'] } },
    { T: [[1, 1], [2, 2], [3, 3]], V: [[4, 4]] }, { 'x -> a': [[1, 1]] });
  assert.deepEqual(r['a -> b'], { pip: 'a -> b', tile: 'T', bits: [[2, 2], [3, 3]], unknown: ['T q -> r'] });
  assert.deepEqual(r['c -> d'].bits, [[4, 4]]);
});

test('check-pips6: a bidirectional PIP\'s direction from its net; the bits by direction', async () => {
  const { pipDirections, pipLookup } = await import('../research/s6/check-pips6.mjs');
  const design = { insts: [{ name: 't', site: 'TIEOFF_X31Y30' }] };
  const net = { outpins: [{ inst: 't', pin: 'HARD1' }], pips: [
    { tile: 'INT_X17Y15', from: 'GFAN1', dir: '=-', to: 'LOGICIN_B51' }, { tile: 'INT_X17Y15', from: 'VCC_WIRE', dir: '->', to: 'LOGICIN_B51' }] };
  assert.deepEqual(pipDirections(device, net, design), [['LOGICIN_B51', 'GFAN1'], ['VCC_WIRE', 'LOGICIN_B51']]);
  const db = { pips: { 'GFAN1 =- LOGICIN_B51': [[18, 25]], 'a -> b': [[1, 1]] }, cover: { 'LOGICIN_B51 -> GFAN1': [[20, 48]] } };
  assert.deepEqual(pipLookup(db, 'GFAN1', '=-', 'LOGICIN_B51'), [[18, 25]]);
  assert.deepEqual(pipLookup(db, 'LOGICIN_B51', '=-', 'GFAN1'), [[20, 48]]);
  assert.deepEqual(pipLookup(db, 'a', '->', 'b'), [[1, 1]]);
  assert.equal(pipLookup(db, 'x', '->', 'y'), undefined);
  // the measured INT switch box: the continuations measured on paths, the bidirectional PIPs both ways
  const read = n => JSON.parse(fs.readFileSync(new URL(`../research/s6/db/xc6slx16-${n}.json`, import.meta.url), 'utf8')).pips;
  const int = read('int'), cover = read('int-cover');
  assert.ok(Object.keys(int).length >= 3449);
  assert.deepEqual(cover['SR1E1 -> SR1B2'], [[8, 32], [8, 33]]);
  assert.deepEqual(cover['LOGICIN_B51 -> GFAN1'], [[20, 48], [20, 55]]);
  assert.deepEqual(cover['GFAN1 -> LOGICIN_B51'], int['GFAN1 =- LOGICIN_B51']);
});
