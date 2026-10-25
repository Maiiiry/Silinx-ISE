// #3, the measured description: hypotheses by a wire's index, for what ISE's routes showed at some indexes only (no
// shipped graph: the measured graph's wires, the observations and the tests' verdicts).
//   pips:  each PIP seen in a tile of the clock column (CLKT, CLKB, CLKL, CLKR, CLKV, CLKC, DCM, GCLK*), its wires' last
//          number varied over 0-15, among the measured graph's wires of the tile, not seen nor probed: arc-probe
//          candidates (probe-run.mjs). (The CLKT tile's doubles across the clock column: CLKV_E2BEG5 -> CLKT_SELDUB2.)
//   joins: each join seen with an end in the clock column, the index varied the same way: join hypotheses
//          (prototype.mjs tests)
//   clock: each known join (observed or confirmed) of two clock lines with an end in an I/O tile, at every index 0-7
//          and at every tile of the same prefix at the same offset: join hypotheses, tested from a BUFGMUX (BUFGSRC=1,
//          MAXDEPTH=10 MAXJOINS=8: the spine, the row and the I/O column's line are a long way from it)
//   node varyjoins.mjs pips|joins|clock measured.json.gz obs.json out.json [probe.json,… | verdict-dir…]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { tileXY, wireFamily } from './observe.mjs';

/** The pairs of wire names a pair takes with its last number varied over 0..n-1: the same index at both ends when they
 *  had the same, else each end alone; okA / okB: the names that exist. [[a, b]], the pair itself among them. */
export function indexVariants(a, b, okA, okB, n = 16) {
  const A = /^(.*?)(\d+)$/.exec(a), B = /^(.*?)(\d+)$/.exec(b), out = new Map();
  if (!A && !B) return [];
  const add = (x, y) => out.set(`${x} ${y}`, [x, y]);
  for (let j = 0; j < n; j++) {
    if (A && B && A[2] === B[2]) { const x = A[1] + j, y = B[1] + j; if (okA(x) && okB(y)) add(x, y); }
    else { if (A && okA(A[1] + j)) add(A[1] + j, b); if (B && okB(B[1] + j)) add(a, B[1] + j); }
  }
  return [...out.values()];
}

const CLOCK_COLUMN = /^(CLKT|CLKB|CLKV|CLKC|CLKL|CLKR|DCM|GCLK)/;
const ord = j => [j[0], j[1]].sort().join('|');

/** The arc-probe candidates: [{ tile, from, to }]. wiresOf(tile): the measured wires of a tile (a Set) or null; asked:
 *  'tile from to' already seen or probed. */
export function pipVariants(pips, wiresOf, asked) {
  const out = new Map();
  for (const p of pips) {
    if (!CLOCK_COLUMN.test(p.tile)) continue;
    const w = wiresOf(p.tile);
    if (!w) continue;
    for (const [x, y] of indexVariants(p.from, p.to, v => w.has(v), v => w.has(v))) {
      const k = `${p.tile} ${x} ${y}`;
      if (!asked.has(k)) out.set(k, { tile: p.tile, from: x, to: y });
    }
  }
  return [...out.values()];
}

/** The join hypotheses of the clock column by index: [[a, b]], none known or tested. */
export function joinVariants(joins, wiresOf, done) {
  const out = new Map();
  for (const [a, b] of joins) {
    const [ta, wa] = a.split('/'), [tb, wb] = b.split('/');
    if (!CLOCK_COLUMN.test(ta) && !CLOCK_COLUMN.test(tb)) continue;
    const A = wiresOf(ta), B = wiresOf(tb);
    if (!A || !B) continue;
    for (const [x, y] of indexVariants(wa, wb, v => A.has(v), v => B.has(v))) { const j = [`${ta}/${x}`, `${tb}/${y}`]; if (!done.has(ord(j))) out.set(ord(j), j); }
  }
  return [...out.values()];
}

/** The I/O columns' clock lines: each known join of two clock lines with an end in an I/O tile, at every index 0-7 and
 *  every tile of the same prefix at the same offset: [[a, b]], none known or tested. tiles: every tile name. */
export function clockLineVariants(joins, tiles, wiresOf, done) {
  const io = t => /IOIS|IBUFS/.test(t);
  const at = new Set(tiles), byPrefix = new Map();
  for (const t of tiles) { const x = tileXY(t); if (x) { if (!byPrefix.has(x.prefix)) byPrefix.set(x.prefix, []); byPrefix.get(x.prefix).push(x); } }
  const out = new Map();
  for (const [a, b] of joins) {
    const [ta, wa] = a.split('/'), [tb, wb] = b.split('/');
    if (!(io(ta) || io(tb)) || wireFamily(wa) !== 'gclk' || wireFamily(wb) !== 'gclk') continue;
    const A = tileXY(ta), B = tileXY(tb), ma = /^(.*?)(\d+)$/.exec(wa), mb = /^(.*?)(\d+)$/.exec(wb);
    if (!A || !B || !ma || !mb) continue;
    for (const X of byPrefix.get(A.prefix) || []) {
      const t1 = `${A.prefix}_X${X.x}Y${X.y}`, t2 = `${B.prefix}_X${X.x + B.x - A.x}Y${X.y + B.y - A.y}`;
      if (!at.has(t2)) continue;
      for (let j = 0; j < 8; j++) {
        const h = [`${t1}/${ma[1]}${j}`, `${t2}/${mb[1]}${j}`];
        if (wiresOf(t1)?.has(ma[1] + j) && wiresOf(t2)?.has(mb[1] + j) && !done.has(ord(h))) out.set(ord(h), h);
      }
    }
  }
  return [...out.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, gf, of, out, ...rest] = process.argv.slice(2);
  const { loadDevice } = await import('../../core/fpga/device.js');
  const G = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(gf))));
  const obs = JSON.parse(fs.readFileSync(of, 'utf8'));
  const cache = new Map();
  const wiresOf = t => { if (!cache.has(t)) { const k = G.tile(t); cache.set(t, k === undefined ? null : new Set(Array.from(G.templates[G.tileTemplate[k]].wires, i => G.names[i]))); } return cache.get(t); };
  if (cmd === 'pips') {
    const asked = new Set(obs.pips.map(p => `${p.tile} ${p.from} ${p.to}`));
    for (const f of (rest[0] || '').split(',').filter(Boolean)) { const p = JSON.parse(fs.readFileSync(f, 'utf8')).pips; for (const x of [...p.yes, ...p.no]) asked.add(`${x.tile} ${x.from} ${x.to}`); }
    const pips = pipVariants(obs.pips, wiresOf, asked);
    fs.writeFileSync(out, JSON.stringify({ part: process.env.PART || 'xc3s250ecp132-4', pips, sites: [] }));
    console.log(`${pips.length} PIP candidates`);
  } else {
    const verdicts = rest.flatMap(d => JSON.parse(fs.readFileSync(path.join(d, 'verdicts.json'), 'utf8')));
    const known = [...obs.joins, ...verdicts.filter(v => v[2] === 'join').map(v => [v[0], v[1]])];
    const done = new Set([...known, ...verdicts.filter(v => v[2] === 'no-join')].map(ord));
    const hyp = cmd === 'joins' ? joinVariants(obs.joins, wiresOf, done) : clockLineVariants(known, G.tileNames, wiresOf, done);
    fs.writeFileSync(out, JSON.stringify(hyp));
    console.log(`${hyp.length} join hypotheses`);
  }
}
