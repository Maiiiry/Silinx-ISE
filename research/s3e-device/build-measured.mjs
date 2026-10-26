// #3, the measured description of the XC3S250E rebuilt from its measurements alone (research/s3e-device/data/xc3s250e,
// README sections 9-15): the observation of ISE's routed designs (obs.json.gz), the other packages' observations
// (others.json.gz: the FT256's pads, Silinx's XB / YB routes ISE's DRC passed), the arc probes (probes.json.gz), the
// verdicts of every round of join and clock tests (verdicts.json.gz, in the order they were taken), with the bit database
// and the device report's grid and sites (dev). chip.mjs makes the measurements, build.mjs packs them.
//   node build-measured.mjs out.json.gz [data-dir] [--dev graph.json.gz]     (the rules on: PINRULES, sections 9 and 11)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chipMeasurements } from './chip.mjs';
import { packMeasured } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PART = 'xc3s250ecp132-4';
export const DATA_DIR = path.join(HERE, 'data', 'xc3s250e');
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());

/** The packed measured description (the object loadDevice() takes) from the data in `dir`; dev: a Device of the part, of
 *  which only the grid and the sites are taken. */
export function buildMeasured(dev, dir = DATA_DIR) {
  const DB = path.join(HERE, '../s3e-bitstream/db');
  const probes = Object.values(gz(path.join(dir, 'probes.json.gz')));
  const verdicts = Object.values(gz(path.join(dir, 'verdicts.json.gz')));
  const m = chipMeasurements({
    dev, tilesDb: JSON.parse(fs.readFileSync(path.join(DB, 's3e-tiles.json'), 'utf8')),
    layout: JSON.parse(fs.readFileSync(path.join(DB, 'xc3s250e-layout.json'), 'utf8')),
    obs: gz(path.join(dir, 'obs.json.gz')), others: gz(path.join(dir, 'others.json.gz')),
    probe: { yes: probes.flatMap(p => p.yes), no: probes.flatMap(p => p.no) },
    joins: verdicts.flatMap(l => l.filter(v => v[2] === 'join').map(v => [v[0], v[1]])),
    rules: true,
  });
  return packMeasured(m);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const di = args.indexOf('--dev'), devFile = di >= 0 ? args.splice(di, 2)[1] : path.join(HERE, '../../core/fpga/devices', `${PART}.json.gz`);
  const [out, dir = DATA_DIR] = args;
  const { loadDevice } = await import('../../core/fpga/device.js');
  const packed = buildMeasured(loadDevice(gz(devFile)), dir);
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(packed), { level: 9 }));
  console.log(`${out}: ${JSON.stringify(packed.counts)}`);
}
