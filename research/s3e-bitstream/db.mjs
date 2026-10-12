// Loads the bit database of a Spartan-3E device (db/*.json) for core/fpga/bitgen.js (Node): the one
// loader of the open flow (server/open-flow-run.js, research/s3e-route/open-flow.mjs) and of the
// experiments. The files, per device (xc3s100e, xc3s250e, xc3s500e, xc3s1200e):
//   s3e-tiles.json             the tile types' features (PIPs, site settings), shared by the devices
//   <device>-tiles.json        (optional) features of one device that add to or replace the shared ones
//   <device>-layout.json       where every tile is in the frame data, the bitstream format (IDCODE, frames)
//   <device>-lut.json          where every LUT is
//   <device>-bram.json         where every block-RAM memory bit is
//   <device>-<package>-pads.json   the pads' own features (absolute bits; the pads differ per package)
// The pads of the package (pin -> I/O tile) come from the device description (padsFromDevice).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb, padsFromDevice } from '../../core/fpga/bitgen.js';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { MIRRORS, mirrorFeatures } from './dcm-mirror.mjs';

/** The part of the experiments (environment PART, default the Basys2-250's XC3S250E-CP132). */
export const PART = process.env.PART || 'xc3s250ecp132-4';

/** The I/O column on the right and the I/O row at the top of a layout: { maxX, maxY }. */
export function edges(layout) {
  return { maxX: Math.max(...Object.keys(layout.cols).map(Number)), maxY: Math.max(...Object.keys(layout.rows).map(Number)) };
}

/** The folder of the bit database. */
export const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'db');

/** Device and package of a part: 'xc3s500efg320-4' -> { device: 'xc3s500e', pkg: 'fg320' }; a
 *  device name alone ('xc3s500e') has pkg null. */
export function splitPart(part) {
  const m = /^(xc3s\d+e)([a-z]+\d+)?(?:-\d+)?$/i.exec(String(part || '').trim());
  return m ? { device: m[1].toLowerCase(), pkg: m[2] ? m[2].toLowerCase() : null } : { device: String(part || '').toLowerCase(), pkg: null };
}

const readJson = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

/** The shared tile types with a device's own features over them (per type: the device's features
 *  win, its other settings replace the shared ones). */
export function mergeTiles(shared, own) {
  if (!own) return shared;
  const types = { ...shared.types };
  for (const [type, t] of Object.entries(own.types || {})) {
    const s = types[type] || { features: {} };
    types[type] = { ...s, ...t, features: { ...(s.features || {}), ...(t.features || {}) } };
  }
  return { ...shared, ...own, types, padDriveDefault: { ...(shared.padDriveDefault || {}), ...(own.padDriveDefault || {}) } };
}

/** The packages whose pads a device's database has ('cp132', 'fg320'). */
export function dbPackages(device, dir = DB_DIR) {
  try { return fs.readdirSync(dir).map(f => new RegExp(`^${device}-([a-z]+\\d+)-pads\\.json$`).exec(f)?.[1]).filter(Boolean).sort(); } catch { return []; }
}

/** Is there a bit database for this device ('xc3s500e') — and, with pkg, for its pads in that package? */
export function hasBitDb(device, { pkg = null, dir = DB_DIR } = {}) {
  const ok = ['layout', 'lut'].every(k => fs.existsSync(path.join(dir, `${device}-${k}.json`))) && fs.existsSync(path.join(dir, 's3e-tiles.json'));
  return ok && (!pkg || fs.existsSync(path.join(dir, `${device}-${pkg}-pads.json`)));
}

/** The JSON files of a device's database: { layout, lut, tiles (shared + the device's), bram,
 *  padFeatures } (null for a file that does not exist). */
export function readDbFiles(device, { pkg = null, dir = DB_DIR } = {}) {
  const r = f => readJson(path.join(dir, f));
  const pads = pkg ? r(`${device}-${pkg}-pads.json`) : null;
  return {
    layout: r(`${device}-layout.json`), lut: r(`${device}-lut.json`)?.lutF || null,
    tiles: mergeTiles(r('s3e-tiles.json') || { types: {} }, r(`${device}-tiles.json`)),
    bram: r(`${device}-bram.json`), padFeatures: pads ? pads.padFeatures : null,
  };
}

/** A DCM whose CLKIN comes from a global clock buffer (a BUFGMUX before the DCM, or two DCMs in
 *  cascade; whether the net reaches CLKIN on a global line or through general routing): ISE's bitgen
 *  clears one bit of DCM:USED, (0, 100) of the top-left DCM (#47: designs of two DCMs in cascade on
 *  the XC3S100E, XC3S250E, XC3S500E and XC3S1200E and of a global buffer before each top / bottom DCM,
 *  converted by ISE: that one bit differed, the same bit of each DCM's mirror image, dcm-mirror.mjs;
 *  from a pad, dedicated or through general routing, it is set). Added to every DCM tile type as
 *  DCM:CLKIN:GCLK, for core/fpga/bitgen.js. */
//  A DCM whose clock outputs CLKFX and CLKFX180 drive nothing (its frequency synthesizer idle): ISE's
//  bitgen clears three more bits of DCM:USED, (-39, 7), (-39, 12), (-39, 43) of the top-left DCM
//  (#47: designs of a DCM with only CLK0 and LOCKED used on each top / bottom DCM of the four devices;
//  the stage-D design that gave DCM:USED had CLKFX used): DCM:DFS:OFF.
export const DCM_ROUTED = { 'DCM:CLKIN:GCLK': ['!0,100'], 'DCM:DFS:OFF': ['!-39,7', '!-39,12', '!-39,43'] };
export function withDcmClkinGclk(tiles) {
  const types = { ...tiles.types };
  for (const type of ['DCM_TL_CENTER', ...Object.keys(MIRRORS)]) {
    if (!types[type]) continue;
    const add = Object.fromEntries(Object.entries(type === 'DCM_TL_CENTER' ? DCM_ROUTED : mirrorFeatures(DCM_ROUTED, type)).filter(([k]) => !types[type].features?.[k]));
    types[type] = { ...types[type], features: { ...(types[type].features || {}), ...add } };
  }
  return { ...tiles, types };
}

/** The bit database of a part ('xc3s500efg320-4'; default PART), ready for
 *  bitgen(). opts: graph (the device description: a Device, or the file / part to load; default the
 *  part's), dir. Throws when the device has no database. */
export function loadDb(part = PART, { graph = null, dir = DB_DIR } = {}) {
  const { device, pkg } = splitPart(part);
  if (!hasBitDb(device, { dir })) throw new Error(`no bit database for ${device}`);
  const files = readDbFiles(device, { pkg, dir });
  const dev = graph && typeof graph === 'object' ? graph : pkg || graph ? loadDeviceCache(graph || part) : null;
  const db = makeDb({ ...files, tiles: withDcmClkinGclk(files.tiles), pads: dev ? padsFromDevice(dev) : {} });
  if (pkg) db.format.part = `${device.slice(2)}${pkg}`;
  return db;
}
