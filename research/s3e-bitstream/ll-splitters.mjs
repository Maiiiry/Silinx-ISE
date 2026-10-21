// #709: the XC3S1200E's other long-line splitters (CLKV_LL: the horizontal long lines joined across the centre
// column; CLKL_IOIS_LL / CLKR_IOIS_LL: the vertical long lines of the I/O columns joined across the centre row),
// measured with gen-pipcover.mjs --types … --long 1 (--nosink 1), ana-pipdrop.mjs (as clkh-ll.mjs did CLKH_LL's,
// stage F). The features: each switch's bits relative to its tile (tileBase; they lie in the clock column's frame 3,
// far from the tile's own), the same in every tile of the type, for db/xc3s1200e-tiles.json (merge-db.mjs --device).
// The codewords of gen-pipdrop.mjs repeat in tiles far apart, and ana-pipdrop.mjs gives a bit to the nearest tile of
// its codeword: a splitter's bit, far from its tile, may go to another switch of the same codeword (that switch then
// shows it, this one none). So a switch keeps, in each tile, the bits of all its observations that show any (their
// intersection); the I/O columns' switches lose the bits in the frame of the centre column's switches (CLKV_LL: the
// clock column's frame 3); and a type's switch has the one pattern its tiles show (a tile that shows none: masked).
//   PART=xc3s1200efg320-4 node ll-splitters.mjs dir/pips.json … > ll-splitters.json
import fs from 'node:fs';
import { loadDb } from './db.mjs';
import { tileOf, tileBase } from '../../core/fpga/bitgen.js';

const TYPES = /^(CLKV_LL|CLKL_IOIS_LL|CLKR_IOIS_LL)$/;
const db = loadDb();
const obs = new Map();   // type \t feature \t tile -> [Set of absolute bits "frame,bit,value"]
for (const f of process.argv.slice(2)) for (const p of JSON.parse(fs.readFileSync(f, 'utf8')).pips) {
  const t = tileOf(p.tile, db);
  if (!t || !TYPES.test(t.type) || !/L[HV]/.test(`${p.from}${p.to}`)) continue;
  const k = `${t.type}\t${p.feature || `${p.from}${p.dir}${p.to}`}\t${p.tile}`;
  (obs.get(k) || obs.set(k, []).get(k)).push(new Set(p.bits.map(b => b.join(','))));
}
// each tile's bits: the intersection of its observations that show any
const bitsAt = new Map();
for (const [k, list] of obs) {
  const shown = list.filter(s => s.size);
  bitsAt.set(k, shown.length ? [...shown[0]].filter(b => shown.every(s => s.has(b))) : []);
}
const centre = new Set([...bitsAt].filter(([k]) => k.startsWith('CLKV_LL\t')).flatMap(([, b]) => b.map(x => x.split(',')[0])));
const seen = new Map();   // type \t feature -> Map(pattern -> tiles)
for (const [k, abs] of bitsAt) {
  const [type, feat, tile] = k.split('\t');
  const b = tileBase(tileOf(tile, db), db);
  const own = type === 'CLKV_LL' ? abs : abs.filter(x => !centre.has(x.split(',')[0]));
  const pat = own.map(x => x.split(',').map(Number)).map(([fr, bit, v]) => `${v ? '' : '!'}${fr - b.frame},${bit - b.bit}`).sort().join(' ');
  const s = seen.get(`${type}\t${feat}`) || seen.set(`${type}\t${feat}`, new Map()).get(`${type}\t${feat}`);
  s.set(pat, [...(s.get(pat) || []), tile]);
}
const types = {};
let bad = 0;
for (const [k, s] of [...seen].sort()) {
  const [type, feat] = k.split('\t');
  if (s.size > 1) s.delete('');
  if (s.size !== 1) { bad++; console.error(`different in different tiles: ${type} ${feat}: ${[...s].map(([p, ts]) => `[${p}]x${ts.length}`).join(' | ')}`); continue; }
  const pat = [...s.keys()][0];
  ((types[type] ||= { features: {}, noRoute: true }).features)[feat] = pat ? pat.split(' ') : [];
}
for (const [t, v] of Object.entries(types)) console.error(`${t}: ${Object.keys(v.features).length} switches`);
console.error(`${bad} different in different tiles`);
console.log(JSON.stringify({ source: 'research/s3e-bitstream #709: gen-pipcover.mjs --types CLKV_LL,CLKT_LL,CLKB_LL,CLKL_IOIS_LL,CLKR_IOIS_LL --long 1 (--nosink 1 --k 8) on the XC3S1200E, ana-pipdrop.mjs, ll-splitters.mjs; ISE 14.7 xdl P.20131013 + bitgen', types }));
