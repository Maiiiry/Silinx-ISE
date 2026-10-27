// Stage S6-C (#725): the settings of a Spartan-6 slice, per kind (SLICEX, SLICEL, SLICEM). One design per kind in
// XDL: a base slice (the four LUTs O6 = A1 * A2, the four flip-flops on O6, used outputs, CLK, SYNC, CE and SR
// used), twice (the first and the last of the design), and one slice per variant, each the base with one element
// changed: every option of every element of the primitive definition (measured/prim-defs.json), its removal when
// the base has it, every BEL without options added. One slice per tile, its neighbour left empty, so that the bits
// of a slice's column and 64-bit band are its own. ise-xdl-bits.sh turns them into bitstreams; ana-slice6.mjs
// compares each variant's bits with the base's.
//   node research/s6/gen-slice6.mjs <out dir> [part …]      (default the XC6SLX16)
// <part>.slice<kind>.xdl and <part>.slice<kind>.json ({ slice: variant name }, 'BASE' the two bases).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../test/s6-lib.mjs';
import { LUTS, lutSlices } from './gen-lutmap6.mjs';

const TYPE = { X: 'SLICEX', L: 'SLICEL', M: 'SLICEM' };
const EQN = '(A1*A2)';

/** The base slice's settings: [[element, BEL name, value]]. */
export function baseSettings() {
  const out = [];
  for (const p of LUTS) {
    out.push([`${p}6LUT`, `s.${p}6`, `#LUT:O6=${EQN}`], [`${p}FF`, `s.${p}FF`, '#FF'], [`${p}FFMUX`, '', 'O6'],
      [`${p}FFSRINIT`, '', 'SRINIT0'], [`${p}USED`, '', '0']);
  }
  out.push(['CLKINV', '', 'CLK'], ['SYNC_ATTR', '', 'SYNC'], ['CEUSED', '', '0'], ['SRUSED', '', '0']);
  return out;
}

/**
 * The variants of a slice kind from its primitive definition ({ element: { bel, cfg } }): [{ name, settings }],
 * each the base with one element changed ('#OFF': removed).
 */
export function sliceVariants(def) {
  const base = baseSettings(), has = new Map(base.map(s => [s[0], s]));
  const out = [], put = (name, set) => out.push({ name, settings: set });
  const replace = (e, s) => base.map(b => (b[0] === e ? s : b));
  for (const [e, { bel, cfg }] of Object.entries(def)) {
    if (/^[A-D]6LUT$/.test(e)) continue;
    if (/^[A-D]5LUT$/.test(e)) { put(`${e}=#LUT`, [...base, [e, `s.${e}`, `#LUT:O5=${EQN}`]]); continue; }
    const b = has.get(e);
    if (b) put(`${e}=#OFF`, base.filter(s => s !== b));
    if (bel && !cfg.length) { put(e, [...base, [e, `s.${e}`, '']]); continue; }
    for (const v of cfg) {
      if (b && b[2] === v) continue;
      const s = [e, bel ? `s.${e}` : '', v];
      put(`${e}=${v}`, b ? replace(e, s) : [...base, s]);
    }
  }
  // a SLICEM's LUT as a RAM: its mode with the LUT a #RAM
  for (const v of out) {
    const m = v.name.match(/^([A-D])([56])RAMMODE=/);
    if (m) v.settings = v.settings.map(s => (s[0] === `${m[1]}6LUT` ? [s[0], s[1], `#RAM:O6=${EQN}`] : s)).concat(m[2] === '5' ? [[`${m[1]}5LUT`, `s.${m[1]}5`, `#RAM:O5=${EQN}`]] : []);
  }
  return out;
}

/** The XDL of a slice: its settings, BEL names made the slice's own. */
export function sliceXdl(slice, settings) {
  const cfg = settings.map(([e, n, v]) => `${e}:${n ? `${slice.name}.${n.slice(2)}` : ''}:${v}`).join(' ');
  return `inst "${slice.name}" "${TYPE[slice.kind]}",placed ${slice.tile} ${slice.name}  ,\n  cfg " ${cfg} " ;\n`;
}

/** The slices of a kind, one per tile: [{ name, kind, tile }]. */
export function oneSlicePerTile(slices, kind) {
  const tiles = new Set();
  return slices.filter(s => s.kind === kind && !tiles.has(s.tile) && tiles.add(s.tile));
}

/** A kind's design: { xdl, manifest: { slice: variant } }, the base first and last. */
export function sliceDesign(part, slices, kind, def) {
  const vs = sliceVariants(def), at = oneSlicePerTile(slices, kind);
  if (at.length < vs.length + 2) throw new Error(`${part}: ${at.length} ${TYPE[kind]} tiles for ${vs.length + 2} slices`);
  const list = [{ name: 'BASE', settings: baseSettings() }, ...vs, { name: 'BASE', settings: baseSettings() }];
  const out = [`design "slice${kind}" ${part} v3.2 ,\n  cfg "";\n`], manifest = {};
  list.forEach((v, i) => { const s = at[i]; out.push(sliceXdl(s, v.settings)); manifest[s.name] = v.name; });
  return { xdl: out.join(''), manifest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...parts] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-slice6.mjs <out dir> [part …]'); process.exit(1); }
  const defs = JSON.parse(fs.readFileSync(new URL('./measured/prim-defs.json', import.meta.url), 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  for (const part of parts.length ? parts : ['xc6slx16csg324-3']) {
    const slices = lutSlices(s6Device(part).sites), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2');
    for (const kind of Object.keys(TYPE)) {
      const { xdl, manifest } = sliceDesign(part, slices, kind, defs[TYPE[kind]]);
      fs.writeFileSync(path.join(out, `${p}.slice${kind}.xdl`), xdl);
      fs.writeFileSync(path.join(out, `${p}.slice${kind}.json`), JSON.stringify(manifest));
      console.log(`${p}.slice${kind}: ${Object.keys(manifest).length} slices`);
    }
  }
}
