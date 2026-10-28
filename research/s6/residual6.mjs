// Stages S6-B … S6-D (#725, #726), the residual: every bit of a design ISE implemented, predicted from the databases
// (the slices: check-slice6.mjs; the INT-like tiles' PIPs: check-pips6.mjs; the other tiles' PIPs: db/s6-pips-other.json
// placed by gridRegion) and compared with ISE's bitstream, over the rows' frames (the block RAM's frames and the I/O
// words are the block RAM's and the I/O's, #727 / #728). A bit left over goes to the tiles whose region holds it, by type.
//   node research/s6/residual6.mjs <dir> …        (each with top.xdl and top.bit, e.g. night 1's impl-nexys3/*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../core/xdl.js';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../../core/fpga/s6/bitstream.js';
import { s6Device } from '../../test/s6-lib.mjs';
import { loadDb, kindModel, predictSlice } from './check-slice6.mjs';
import { pipDirections, pipLookup } from './check-pips6.mjs';
import { tileRegion } from './ana-pipprobe6.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';

const INT_LIKE = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)_X/;
const read = n => JSON.parse(fs.readFileSync(new URL(`./db/${n}.json`, import.meta.url), 'utf8'));

/** The bits the databases predict for a design: { bits: Set 'frame,bit', unknown: Map 'what' -> count }. */
export function predictDesign(design, device, dev, db) {
  const bits = new Set(), unknown = new Map(), note = w => unknown.set(w, (unknown.get(w) || 0) + 1);
  const kindOf = new Map([...s6Device(db.part).sites.slices.values()].map(s => [s.name, s.kind])), models = {};
  for (const inst of design.insts) {
    if (!/^SLICE/.test(inst.type) || !inst.placed) continue;
    const kind = kindOf.get(inst.site), type = inst.tile.replace(/_.*/, ''), [f0, b0] = db.slices.lut.slices[inst.site];
    const p = predictSlice(models[`${kind} ${type}`] ??= kindModel(db.slices, kind, type), inst.cfg);
    if (p.ram) note(`${inst.site} a RAM's contents`);
    for (const u of p.unknown) note(`SLICE${kind} ${u}`);
    for (const x of p.bits) { const [f, b] = x.split(',').map(Number); bits.add(`${f0 + f},${b0 + b}`); }
  }
  for (const net of design.nets) {
    const dirs = (net.pips || []).some(p => p.dir === '=-') ? pipDirections(device, net, design) : null;
    (net.pips || []).forEach((p, i) => {
      if (/^CLEX[LM]_/.test(p.tile)) return;
      let rel, r;
      if (INT_LIKE.test(p.tile)) {
        const [from, to] = dirs?.[i] ?? [p.from, p.to];
        rel = pipLookup(db.int, from, p.dir, to);
        r = tileRegion(dev, p.tile);
      } else {
        const x = db.other.pips[`${p.tile.replace(/_X\d+Y\d+$/, '')} ${p.from} ${p.dir} ${p.to}`];
        rel = x?.map(s => s.split(',').map(Number));
        r = gridRegion(device, dev, p.tile);
      }
      if (!rel) { note(`${p.tile.replace(/_X\d+Y\d+$/, '')} ${p.from} ${p.dir} ${p.to}`); return; }
      for (const [m, b] of rel) bits.add(`${r[0] + m},${r[1] + b}`);
    });
  }
  return { bits, unknown };
}

/** The tile types whose regions hold a bit (gridRegion of every tile, indexed once per device). */
export function typesAt(device, dev, cache = typesAt.cache ??= new WeakMap()) {
  let index = cache.get(device);
  if (!index) {
    index = [];
    for (let k = 0; k < device.tileNames.length; k++) {
      const t = device.tileNames[k];
      if (/^NULL/.test(t)) continue;
      const [c0, b0, n, nb] = gridRegion(device, dev, t);
      index.push([c0, b0, n, nb, device.tileType(k)]);
    }
    cache.set(device, index);
  }
  return (f, b) => [...new Set(index.filter(([c0, b0, n, nb]) => f >= c0 && f < c0 + n && b >= b0 && b < b0 + nb).map(x => x[4]))].sort().join('+') || '?';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/residual6.mjs <dir> …'); process.exit(1); }
  const int = { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips }, other = read('s6-pips-other');
  const left = new Map(), extra = new Map(), unknown = new Map();
  for (const dir of dirs) {
    const bit = fs.readFileSync(path.join(dir, 'top.bit')), r6 = readBit6(bit), dev = bitFormat6(r6.device.part);
    const part = `${r6.device.device}${r6.device.part.slice(r6.device.device.length - 2)}-3`, { device } = s6Device(part);
    const design = parseXdl(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'));
    const { bits, unknown: u } = predictDesign(design, device, dev, { part, slices: loadDb(r6.device.device), int, other });
    for (const [w, n] of u) unknown.set(w, (unknown.get(w) || 0) + n);
    const empty = emptyFdri(dev), end = dev.rows * dev.rowFrames * FRAME_WORDS, have = new Set(), where = typesAt(device, dev);
    for (let w = 0; w < end; w++) { const x = r6.fdri[w] ^ empty[w]; if (x) for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) have.add(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`); }
    let nl = 0, ne = 0;
    for (const x of have) if (!bits.has(x)) { const [f, b] = x.split(',').map(Number), t = where(f, b); left.set(t, [...(left.get(t) || []), `${path.basename(dir)} ${x}`]); nl++; }
    for (const x of bits) if (!have.has(x)) { const [f, b] = x.split(',').map(Number), t = where(f, b); extra.set(t, [...(extra.get(t) || []), `${path.basename(dir)} ${x}`]); ne++; }
    console.log(`${dir}: ${have.size} bits set, ${bits.size} predicted; ${nl} left over, ${ne} predicted and not set`);
  }
  const show = m => [...m].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `${t} ×${l.length} (${l.slice(0, 2).join('; ')})`).join('\n  ');
  console.log(`left over, by the tiles there:\n  ${show(left) || 'none'}`);
  console.log(`predicted and not set:\n  ${show(extra) || 'none'}`);
  if (unknown.size) console.log(`not in the databases: ${[...unknown].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, n]) => `${w} ×${n}`).join(', ')}`);
}
