// #97: the input delays of neighbouring pads in combination. #44 found that with random input delays a pad's
// bits depend on its neighbours' delays too (about 60 % of the held-out designs byte-identical): here, on a
// design routed by ISE with inputs on every pad (gen-iobreg.mjs ri: input registers, IFD_DELAY_VALUE 0-6;
// rb: direct inputs, IBUF_DELAY_VALUE 0-12), the variants give the pads of each I/O tile every pair of values:
// with K values, variant v gives a tile's first pad v mod K, its second floor(v / K), a third their sum mod K
// (every pair of values on every two pads of a tile in K x K variants), written as ISE's map writes each value
// (gen-iobrand.mjs setDelay). The other settings stay as ISE routed them.
//   node gen-iobdly.mjs routed.xdl outdir [--ibuf]
import fs from 'node:fs';
import { setDelay } from './gen-iobrand.mjs';

const args = process.argv.slice(2);
const ibuf = args.includes('--ibuf');
const [src, out] = args.filter(a => !a.startsWith('--'));
const K = ibuf ? 13 : 7;
const text = fs.readFileSync(src, 'utf8');
const re = /(inst "[^"]*" "(?:IOB|IBUF)",placed (\S+) \S+\s*,\s*cfg ")([^"]*)(")/g;
// the I/O sites with an input of the kind, by tile, in the order of the design
const order = new Map();
for (const m of text.matchAll(re)) {
  const c = m[3];
  const reg = /(^|\s)IFF1:[^\s]*:#FF/.test(c) || /(^|\s)IFFDMUX::1/.test(c);
  if (ibuf ? reg || !/(^|\s)IMUX::1/.test(c) : !reg) continue;
  if (!order.has(m[2])) order.set(m[2], 0);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/BASE.xdl`, text);
const key = {};
for (let v = 0; v < K * K; v++) {
  const k = new Map([...order.keys()].map(t => [t, 0]));
  const t = text.replace(re, (m, a, tile, cfg, b) => {
    if (!k.has(tile)) return m;
    const c = cfg, reg = /(^|\s)IFF1:[^\s]*:#FF/.test(c) || /(^|\s)IFFDMUX::1/.test(c);
    if (ibuf ? reg || !/(^|\s)IMUX::1/.test(c) : !reg) return m;
    const j = k.get(tile);
    k.set(tile, j + 1);
    const x = v % K, y = Math.floor(v / K) % K, val = [x, y, (x + y) % K][j % 3];
    (key[`V${String(v).padStart(3, '0')}`] ||= {})[`${tile}#${j}`] = val;
    return a + setDelay(c, val) + b;
  });
  fs.writeFileSync(`${out}/V${String(v).padStart(3, '0')}.xdl`, t);
}
fs.writeFileSync(`${out}/key.json`, JSON.stringify({ src, K, ibuf, values: key }));
console.log(`${order.size} tiles, ${K * K} variants`);
