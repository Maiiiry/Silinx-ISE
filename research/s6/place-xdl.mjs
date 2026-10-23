// The examples placed by the Spartan-6 placer (#729), as XDL for ISE's check (research/s6/ise-place-check.sh):
// <out>/<example>-<board>/placed.xdl.
//
//   node research/s6/place-xdl.mjs <out> [--seed 1] [example …]
import fs from 'node:fs';
import path from 'node:path';
import { writeXdl } from '../../core/xdl.js';
import { placeS6 } from '../../core/fpga/s6/place.js';
import { checkPlacementS6 } from '../../core/fpga/s6/place-check.js';
import { placedXdlS6 } from '../../core/fpga/s6/xdl.js';
import { EXAMPLE_ORDER } from '../../core/examples.js';
import { S6_BOARDS, s6Device, s6Example } from '../../test/s6-lib.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out) { console.error('usage: node research/s6/place-xdl.mjs <out> [--seed 1] [example …]'); process.exit(1); }
const seed = args.includes('--seed') ? +args[args.indexOf('--seed') + 1] : 1;
const names = args.slice(1).filter(a => EXAMPLE_ORDER.includes(a));
for (const { board, part } of S6_BOARDS) {
  const { device, sites } = s6Device(part);
  for (const name of names.length ? names : EXAMPLE_ORDER) {
    const d = await s6Example(name, board);
    const r = placeS6(d.phys, sites, { nl: d.nl, seed });
    const err = checkPlacementS6(d.phys, sites, r);
    if (err.length) throw new Error(`${board} ${name}: ${err.join('; ')}`);
    const x = placedXdlS6(d.nl, d.packed, d.phys, r, { part, device, name: `${name}-${board}` });
    const dir = path.join(out, `${name}-${board}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'placed.xdl'), writeXdl({ ...x, comment: `${name} on the ${board} (${part}), placed by the Silinx toolchain (seed ${seed})` }));
    console.log(`${board} ${name}: ${dir}`);
  }
}
