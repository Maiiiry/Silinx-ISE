// #3, step 5 of the recommendation: the measured description of the whole chip, in Silinx's packed format (build.mjs),
// from what the steps measured (research/s3e-device/README.md), to compare whole with the shipped graph (prototype.mjs
// compare) and to route the examples on it.
//   PIPs of a tile: the bit database's features of its type (each accepted by xdl -xdl2ncd and its bits measured; an I/O
//     tile's in its own wire names, IOIS_<name>, as candidates.mjs io), less what the type lacks (`absent`, #74) and
//     what the arc probe refused in that tile, and every PIP ISE's routes took in a tile of the type (a bidirectional
//     one, `a =- b`, both ways);
//   wires: the PIPs' ends and the pins' wires;
//   sites: names, types and bonding from the device report (as round 8 took them); their pins where observed (every
//     fact of step 3: ISE's routes, another package's renamed);
//   joins: observed in ISE's routes, and confirmed by the tests (rounds 1-8, the edge tiles, the clock network); a carry
//     chain's lower CIN on the tile below's COUT_Nk (observe.mjs pinJoins), its wire CIN<k> of its slice's COUT<k>.
// The tiles of one type with different PIP sets are variants of it (the type's name kept).
//   node chip.mjs out.json.gz obs.json --dev ref.json.gz [--ft obs.json,…] [--probe probe.json,…] [--tests dir,…] [--clock dir,…]
//   (--ft: observations whose pins only are taken: another package's, its pads renamed; designs whose pins ISE's DRC
//   confirmed, such as Silinx's routes of the XB / YB outputs, which ISE's own designs never use)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PIP_BIDI } from '../../core/fpga/device.js';
import { tileXY } from './observe.mjs';
import { packMeasured } from './build.mjs';
import { renamePads } from './pins.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PART = process.env.PART || 'xc3s250ecp132-4';
const readJson = f => JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));

/**
 * The measurements (build.mjs's format) of the whole chip. dev: the device report's grid and sites (a Device: tile
 * names, their sites' names, types and bonding; nothing of its wires, PIPs or nodes is taken); tilesDb: the bit
 * database's s3e-tiles.json; layout: the device's layout (its break rows); obs: an observation (prototype.mjs observe);
 * others: other packages' observations (their pads renamed, pins.mjs); probe: { yes, no } of the arc probe; joins:
 * [[a, b]] confirmed by tests.
 */
export function chipMeasurements({ dev, tilesDb, layout, obs, others = [], probe = { yes: [], no: [] }, joins = [], rules = false }) {
  const dbType = name => { const x = tileXY(name); if (!x) return null; return x.prefix === 'CLB' ? ((layout.brkRows || []).includes(x.y) ? 'CENTER_SMALL_BRK' : 'CENTER_SMALL') : x.prefix; };
  const io = t => /IOIS|IBUFS/.test(tileXY(t)?.prefix || '');
  // ISE's routes: the PIPs of each type, and the wires named IOIS_<name> in the I/O tiles
  const seen = new Map(), ioWires = new Set();
  for (const p of obs.pips) {
    const ty = dbType(p.tile);
    if (!seen.has(ty)) seen.set(ty, new Map());
    const m = seen.get(ty);
    m.set(`${p.from}->${p.to}`, (m.get(`${p.from}->${p.to}`) || 0) | (p.dir === '=-' ? PIP_BIDI : 0));
    if (p.dir === '=-') m.set(`${p.to}->${p.from}`, PIP_BIDI);
    if (io(p.tile)) { ioWires.add(p.from); ioWires.add(p.to); }
  }
  // and the ones the arc probe found there (IOIS_X0: no route of ISE's took an I/O tile's X output)
  for (const p of probe.yes || []) if (io(p.tile)) { ioWires.add(p.from); ioWires.add(p.to); }
  // (the database's names of an I/O tile's wires: its rename table, IOIS_VCC_WIRE as VCC_PINWIRE, IOIS_<name> as <name>)
  const ioName = w => (w === 'VCC_PINWIRE' ? 'IOIS_VCC_WIRE' : ioWires.has(`IOIS_${w}`) ? `IOIS_${w}` : w);
  const featCache = new Map();
  const features = ty => {
    if (!featCache.has(ty)) {
      const t = tilesDb.types[ty], out = new Map();
      if (t) {
        const absent = new Set(t.absent || []);
        for (const f of new Set([...Object.keys(t.features || {}), ...Object.keys(tilesDb.types[t.sameAs]?.features || {})])) {
          const m = /^(\S+)->(\S+)$/.exec(f);
          if (!m || absent.has(f) || absent.has(m[1]) || absent.has(m[2])) continue;
          out.set(io(`${ty}_X0Y0`) ? `${ioName(m[1])}->${ioName(m[2])}` : f, 0);
        }
      }
      featCache.set(ty, out);
    }
    return featCache.get(ty);
  };
  const refused = new Map();
  for (const p of probe.no || []) { if (!refused.has(p.tile)) refused.set(p.tile, new Set()); refused.get(p.tile).add(`${p.from}->${p.to}`); }
  const probedYes = new Map();
  for (const p of probe.yes || []) { if (!probedYes.has(p.tile)) probedYes.set(p.tile, new Set()); probedYes.get(p.tile).add(`${p.from}->${p.to}`); }
  // pins: (tile type, site position, pin) -> [dir, wire]
  const pinAt = new Map();
  for (const p of [...obs.pins, ...others.flatMap(o => renamePads(o, dev).pins)]) {
    const s = dev.site(p.site);
    if (!s) continue;
    const i = dev.tileSites[s.tile].findIndex(([n]) => n === p.site);
    pinAt.set(`${dev.templates[dev.tileTemplate[s.tile]].type}|${i}|${p.pin}`, [p.dir, p.wire]);
  }
  // a carry chain's lower CIN (pinJoins: on the node of the tile below's COUT_Nk, its own wire not named by the route): the
  // wire CIN<k> of the slice's own COUT<k>, the index every observed carry pin follows (COUT3 / CIN3, COUT1 / CIN1)
  const pinJoins = [];
  for (const pj of obs.pinJoins || []) {
    const s = dev.site(pj.site);
    if (!s || pj.pin !== 'CIN') continue;
    const i = dev.tileSites[s.tile].findIndex(([n]) => n === pj.site), tt = dev.templates[dev.tileTemplate[s.tile]].type;
    const cout = pinAt.get(`${tt}|${i}|COUT`);
    if (!cout) continue;
    const w = `CIN${cout[1].replace(/^COUT/, '')}`;
    if (!pinAt.has(`${tt}|${i}|CIN`)) pinAt.set(`${tt}|${i}|CIN`, ['i', w]);
    pinJoins.push([pj.end, `${pj.tile}/${pinAt.get(`${tt}|${i}|CIN`)[1]}`]);
  }
  // (PINRULES=1: a slice pin no design showed in a tile type taken from the other CLB type's same position, CENTER_SMALL /
  // CENTER_SMALL_BRK being the same slices; an XB / YB not seen at a position, XB<k> / YB<k> of the position's COUT<k>.
  // Rules, not measurements: what a route uses of them ISE checks, scripts/check-open-flow.mjs)
  let byRule = 0;
  if (rules) {
    const twin = { CENTER_SMALL: 'CENTER_SMALL_BRK', CENTER_SMALL_BRK: 'CENTER_SMALL' };
    for (const [k, v] of [...pinAt]) {
      const [tt, i, pin] = k.split('|');
      if (twin[tt] && !pinAt.has(`${twin[tt]}|${i}|${pin}`)) { pinAt.set(`${twin[tt]}|${i}|${pin}`, v); byRule++; }
    }
    for (const tt of Object.keys(twin)) for (let i = 0; i < 4; i++) {
      const cout = pinAt.get(`${tt}|${i}|COUT`);
      if (!cout) continue;
      const n = cout[1].replace(/^COUT/, '');
      for (const pin of ['XB', 'YB']) if (!pinAt.has(`${tt}|${i}|${pin}`)) { pinAt.set(`${tt}|${i}|${pin}`, ['o', `${pin}${n}`]); byRule++; }
    }
  }
  const types = {}, variant = new Map(), tiles = [];
  for (let k = 0; k < dev.tileCount; k++) {
    const name = dev.tileNames[k], ty = dbType(name), tp = dev.templates[dev.tileTemplate[k]];
    if (!ty) continue;
    const pips = new Map(features(ty));
    for (const [f, fl] of seen.get(ty) || []) pips.set(f, (pips.get(f) || 0) | fl);
    for (const f of probedYes.get(name) || []) if (!pips.has(f)) pips.set(f, 0);
    for (const f of refused.get(name) || []) pips.delete(f);
    // (PINRULES: a VCC site's VCCOUT no design showed in the type, on the type's VCC wire, the one wire named *VCC* its
    // PIPs leave)
    if (rules) tp.sites.forEach((st, i) => {
      if (st.type !== 'VCC' || pinAt.has(`${tp.type}|${i}|VCCOUT`)) return;
      const vcc = [...new Set([...pips.keys()].map(f => f.split('->')[0]).filter(w => /VCC/.test(w)))];
      if (vcc.length === 1) { pinAt.set(`${tp.type}|${i}|VCCOUT`, ['o', vcc[0]]); byRule++; }
    });
    const sites = tp.sites.map((s, i) => ({ type: s.type, pins: [...s.pins.keys()].map(pin => pinAt.get(`${tp.type}|${i}|${pin}`) && [pin, ...pinAt.get(`${tp.type}|${i}|${pin}`)]).filter(Boolean).sort() }));
    if (!pips.size && !sites.some(s => s.pins.length)) continue;
    const list = [...pips].map(([f, fl]) => { const [a, b] = f.split('->'); return [a, b, fl]; }).sort((a, b) => (`${a[0]}>${a[1]}` < `${b[0]}>${b[1]}` ? -1 : 1));
    const sig = `${tp.type}|${JSON.stringify(list)}|${JSON.stringify(sites)}`;
    if (!variant.has(sig)) {
      const key = `${tp.type}#${variant.size}`;
      const wires = new Set();
      for (const [a, b] of list) { wires.add(a); wires.add(b); }
      for (const s of sites) for (const [, , w] of s.pins) wires.add(w);
      types[key] = { name: tp.type, wires: [...wires].sort(), pips: list, sites };
      variant.set(sig, key);
    }
    tiles.push({ name, type: variant.get(sig), sites: dev.tileSites[k].map(([n, b]) => [n, b]) });
  }
  // joins whose two ends are wires of the measured tiles
  const wiresOf = new Map(tiles.map(t => [t.name, new Set(types[t.type].wires)]));
  const has = k => { const i = k.indexOf('/'); return wiresOf.get(k.slice(0, i))?.has(k.slice(i + 1)); };
  const ord = ([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const all = [...new Map([...obs.joins, ...pinJoins, ...joins].filter(([a, b]) => has(a) && has(b)).map(j => [ord(j), j])).values()];
  return { part: PART, family: 'spartan3e', types, tiles, joins: all, dropped: obs.joins.length + joins.length - all.length, byRule };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
  const devFile = opt('--dev'), ft = opt('--ft'), probeFile = opt('--probe'), tests = opt('--tests'), clock = opt('--clock');
  const [out, obsFile] = args;
  const { loadDevice } = await import('../../core/fpga/device.js');
  const dev = loadDevice(readJson(devFile || path.join(HERE, '../../core/fpga/devices', `${PART}.json.gz`)));
  const DB = path.join(HERE, '../s3e-bitstream/db');
  const joins = [
    ...(tests ? tests.split(',') : []).flatMap(d => readJson(path.join(d, 'verdicts.json')).filter(v => v[2] === 'join').map(v => [v[0], v[1]])),
    ...(clock ? clock.split(',') : []).flatMap(d => readJson(path.join(d, 'verdicts.json')).filter(v => v[2] === 'join').map(v => [v[0], v[1]])),
  ];
  const m = chipMeasurements({
    dev, tilesDb: readJson(path.join(DB, 's3e-tiles.json')), layout: readJson(path.join(DB, `${PART.replace(/(cp|fg|vq|tq|pq|ft)\d+-\d+$/, '')}-layout.json`)),
    obs: readJson(obsFile), others: ft ? ft.split(',').map(readJson) : [], joins,
    probe: probeFile ? probeFile.split(',').map(f => readJson(f).pips).reduce((a, b) => ({ yes: [...a.yes, ...b.yes], no: [...a.no, ...b.no] })) : undefined,
    rules: process.env.PINRULES === '1',
  });
  const packed = packMeasured(m);
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(packed), { level: 9 }));
  console.log(`${m.tiles.length} tiles of ${Object.keys(m.types).length} type variants, ${m.joins.length} joins (${m.dropped} with an end not among the measured wires)${m.byRule ? `, ${m.byRule} slice pins by rule` : ''}: ${JSON.stringify(packed.counts)}`);
}
