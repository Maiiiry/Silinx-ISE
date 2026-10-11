// The settings of the other three DCMs from the top-left one's (stage D: every value measured on
// DCM_TL_CENTER): the four DCMs are mirror images in the frame data (stage F, measured with
// gen-sitevar.mjs on a design of the four DCMs, a subset of the values changed on two DCMs at a time:
// sv-dcm-a = bottom left + top right, sv-dcm-b = bottom right + top left). Relative to its tile, a bit
// (df, db) of the top-left DCM is (18 - df, db) in the top-right one (the column mirrored: 19 frames),
// (df, 63 - db) in the bottom ones (the row mirrored: 64 bits), both for the bottom right. Not mirrored:
// the pin inverters (PSCLKINV…, in the tile's own switch-box frames: the same bits in all four), and
// the bits in frame 37 of the top-left DCM (the last frame of the right DCM's column): one place per
// pair of DCMs, top and bottom, shared by the two (bits 240 / 242: the CLKFX input frequency range).
import fs from 'node:fs';

const PAIR = 37;   // the top-left DCM's frame of the pair's shared bits
export const MIRRORS = {
  DCM_TR_CENTER: ([df, db]) => (df === PAIR ? [df - 19, db] : [18 - df, db]),
  DCM_BL_CENTER: ([df, db]) => (df === PAIR ? [df, db - 320] : [df, 63 - db]),
  DCM_BR_CENTER: ([df, db]) => (df === PAIR ? [df - 19, db - 320] : [18 - df, 63 - db]),
};

/** The features of the top-left DCM's settings (not its PIPs) mirrored onto tile type `type`. */
export function mirrorFeatures(tl, type) {
  const m = MIRRORS[type];
  const out = {};
  for (const [k, bits] of Object.entries(tl)) {
    if (!k.startsWith('DCM:')) continue;
    if (/^DCM:\w+INV:/.test(k)) { out[k] = [...bits]; continue; }
    out[k] = bits.map(s => { const [df, db] = m(s.replace('!', '').split(',').map(Number)); return `${s[0] === '!' ? '!' : ''}${df},${db}`; }).sort();
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const tl = JSON.parse(fs.readFileSync(new URL('./db/s3e-tiles.json', import.meta.url), 'utf8')).types.DCM_TL_CENTER.features;
  const args = process.argv.slice(2);
  if (args[0] === '--check') {
    let same = 0, diff = 0;
    for (const f of args.slice(1)) {
      for (const [type, t] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')).types)) {
        const want = type === 'DCM_TL_CENTER' ? tl : mirrorFeatures(tl, type);
        for (const [k, bits] of Object.entries(t.features)) {
          if (!want[k]) { console.log(`${type} ${k}: not a feature of the top-left DCM`); diff++; continue; }
          const a = [...bits].sort().join(' '), b = [...want[k]].sort().join(' ');
          if (a === b) same++; else { diff++; console.log(`${type} ${k}: measured [${a}], mirror [${b}]`); }
        }
      }
    }
    console.log(`${same} features as the mirror, ${diff} differ`);
    process.exit(diff ? 1 : 0);
  }
  const types = {};
  for (const type of Object.keys(MIRRORS)) types[type] = { features: mirrorFeatures(tl, type) };
  console.log(JSON.stringify({ source: 'research/s3e-bitstream (see README.md, stage F): the top-left DCM\'s settings mirrored (dcm-mirror.mjs), the mirror checked on a subset of the values measured on each DCM (gen-sitevar.mjs, ana-sitevar.mjs, sitevar-features.mjs); ISE 14.7 xdl P.20131013 + bitgen; 2026-10-11', types }));
}
