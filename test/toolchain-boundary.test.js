// The Silinx toolchain's boundary (#1672, step 1 of #1651, docs/TOOLCHAIN-SEPARATION.md): the toolchain's modules
// (synthesis, pack, place, route, timing, bitgen, the device data, the flow, their formats and parts) import
// nothing of the IDE but the modules listed below, each with its importer. A new import across the boundary
// fails; an entry must leave the list once its import is gone (the list only shrinks, as test/code-size.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// the toolchain's modules of core/
const TOOLCHAIN = [
  /^core\/fpga\//,
  /^core\/synth-open[\w-]*\.js$/,
  /^core\/open-flow-[\w-]+\.js$/,
  /^core\/(carry-chain|synth-fsm|lut-resynth|open-steps|xdl|ucf|resources|resource-check|family|power)\.js$/,
];
const inToolchain = (f) => TOOLCHAIN.some((r) => r.test(f));

// the IDE's modules the toolchain imports on 2026-10-27, `importer -> imported`; never add to it
const ALLOWED = new Set([
  'core/fpga/techview.js -> core/techview.js', // #1673: the old path of the view, until its importers switch (step 7)
  'core/open-flow-core.js -> core/compile.js', // step 4, #1675: the front end through io
  'core/open-flow-core.js -> core/unisim.js',
  'core/open-flow-models.js -> core/compile.js',
  'core/open-flow-models.js -> core/sim-model.js',
  'core/open-flow-models.js -> core/unisim.js',
  'core/synth-open.js -> core/synth-front.js', // #1674: synthesizeOpen from the front end, until its importers switch (step 7)
]);
// the npm packages it imports (its dependencies once it is a package of its own)
const PACKAGES = new Set(['@yowasp/yosys']);

function sources(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'devices' ? [] : sources(rel);
    return /\.m?js$/.test(e.name) ? [rel] : [];
  });
}

// the imports of a module's text that leave the toolchain: `importer -> imported` for a module of the
// repository, `importer -> package` for an npm package (node: built-ins are not counted)
const IMPORTS = /(?:\bimport\s[^;]*?from\s*|\bexport\s[^;]*?from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
function crossings(file, text) {
  const out = [];
  for (const [, spec] of text.matchAll(IMPORTS)) {
    if (spec.startsWith('node:')) continue;
    let target;
    if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    else if (spec.startsWith('/')) target = spec.slice(1); // the browser's /core/… URLs
    else target = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (!inToolchain(target)) out.push(`${file} -> ${target}`);
  }
  return out;
}

const toolchain = sources('core').filter(inToolchain).sort();
const found = toolchain.flatMap((f) => crossings(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
// a module of the repository is a .js path; a package, its name
const isPackage = (c) => !/\.m?js$/.test(c.split(' -> ')[1]);

test('#1672 toolchain boundary: how the imports across are found', () => {
  const text = [
    "import { a } from './route.js';", // within
    "import * as c from '../compile.js';", // across, relative
    "export { s } from '../schdoc.js';", // a re-export
    "const m = await import('/core/sim-model.js');", // dynamic, the browser's URL
    "import fs from 'node:fs';", // a built-in
    "import { runYosys } from '@yowasp/yosys/x.js';", // a package
    "import elk from 'elkjs/lib/elk.bundled.js';",
  ].join('\n');
  assert.deepEqual(crossings('core/fpga/x.js', text), [
    'core/fpga/x.js -> core/compile.js',
    'core/fpga/x.js -> core/schdoc.js',
    'core/fpga/x.js -> core/sim-model.js',
    'core/fpga/x.js -> @yowasp/yosys',
    'core/fpga/x.js -> elkjs',
  ]);
  assert.deepEqual(crossings('core/synth-open.js', "import { x } from './synth-open-yosys.js';\nimport { u } from './ucf.js';"), []);
});

test('#1672 toolchain boundary: the toolchain\'s modules are found', () => {
  for (const f of ['core/fpga/route.js', 'core/fpga/bitgen.js', 'core/fpga/s6/bitstream.js', 'core/synth-open.js',
    'core/open-flow-core.js', 'core/xdl.js', 'core/ucf.js', 'core/family.js']) assert.ok(toolchain.includes(f), f);
  for (const f of ['core/compile.js', 'core/sim-model.js', 'core/schdoc.js']) assert.ok(!toolchain.includes(f), f);
  assert.ok(toolchain.length >= 70, `${toolchain.length} modules`);
});

test('#1672 toolchain boundary: no new import of the IDE, no listed one gone', () => {
  const ide = found.filter((c) => !isPackage(c));
  assert.deepEqual(ide.filter((c) => !ALLOWED.has(c)), [], 'the toolchain imports the IDE: give it through the flow\'s io instead (docs/TOOLCHAIN-SEPARATION.md)');
  assert.deepEqual([...ALLOWED].filter((c) => !ide.includes(c)), [], 'gone: remove them from ALLOWED');
});

test('#1672 toolchain boundary: no npm package but its dependencies', () => {
  const pkgs = new Set(found.filter(isPackage).map((c) => c.split(' -> ')[1]));
  assert.deepEqual([...pkgs].filter((p) => !PACKAGES.has(p)), []);
  assert.deepEqual([...PACKAGES].filter((p) => !pkgs.has(p)), [], 'no longer imported: remove it from PACKAGES');
});
