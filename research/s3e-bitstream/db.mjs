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
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { splitPart, mergeTiles, withDcmClkinGclk, DCM_ROUTED, dbFileNames, dbFilesFrom, makeBitDb } from '../../core/fpga/bitdb.js';

// (the database's logic is core/fpga/bitdb.js, shared with the browser; this module reads the files)
export { splitPart, mergeTiles, withDcmClkinGclk, DCM_ROUTED };

/** The part of the experiments (environment PART, default the Basys2-250's XC3S250E-CP132). */
export const PART = process.env.PART || 'xc3s250ecp132-4';

/** The I/O column on the right and the I/O row at the top of a layout: { maxX, maxY }. */
export function edges(layout) {
  return { maxX: Math.max(...Object.keys(layout.cols).map(Number)), maxY: Math.max(...Object.keys(layout.rows).map(Number)) };
}

/** The folder of the bit database. */
export const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'db');

const readJson = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

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
  const names = dbFileNames(device, pkg);
  return dbFilesFrom(Object.fromEntries(Object.entries(names).map(([k, f]) => [k, readJson(path.join(dir, f))])), pkg);
}

/** The bit database of a part ('xc3s500efg320-4'; default PART), ready for
 *  bitgen(). opts: graph (the device description: a Device, or the file / part to load; default the
 *  part's), dir. Throws when the device has no database. */
export function loadDb(part = PART, { graph = null, dir = DB_DIR } = {}) {
  const { device, pkg } = splitPart(part);
  if (!hasBitDb(device, { dir })) throw new Error(`no bit database for ${device}`);
  const files = readDbFiles(device, { pkg, dir });
  const dev = graph && typeof graph === 'object' ? graph : pkg || graph ? loadDeviceCache(graph || part) : null;
  return makeBitDb(files, dev, part);
}
