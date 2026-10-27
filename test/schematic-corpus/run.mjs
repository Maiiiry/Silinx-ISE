#!/usr/bin/env node
// The schematic corpus (#1687): the hand-made schematics, the ISE fixtures and the gates example (manifest.json), and
// the schematics generated from the design corpus's HDL (test/designs-corpus/manifest.json, fetched; their schematics
// made at run time into .cache/schematic-corpus/, never committed), through the stages of lib.mjs, each schematic's
// results compared with expected.json. The fast stages (load, check, hdl, sim, ise) of the committed schematics also
// run in the unit tests (test/schematic-corpus.test.js); synth and flow, and the generated schematics, only here.
//
//   npm run test:schematics                                the committed schematics, every stage
//   npm run test:schematics -- --filter bus --stages load,check,sim
//   npm run test:schematics -- --generated [--filter epfl]  the schematics of the design corpus (the network once)
//   npm run test:schematics -- --update                    the results recorded as the expectations, and the README's table
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, FAST_STAGES, runFast, runSynth, runFlow, compareExpectations, updatedExpectations, table } from './lib.mjs';
import { loadItems, generatedItems } from './items.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = path.join(HERE, 'expected.json');
const README = path.join(HERE, 'README.md');
const a = process.argv.slice(2);
const opt = k => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
const filters = (opt('--filter') || '').split(',').filter(Boolean);
const stages = (opt('--stages') || STAGES.join(',')).split(',');
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const pick = n => !filters.length || filters.some(f => n.includes(f));

const items = a.includes('--generated') ? await generatedItems({ filter: pick, log: console.log }) : loadItems(manifest).filter(it => pick(it.name));
const results = {};
for (const it of items) {
  const t0 = Date.now();
  let r;
  if (it.error) r = { name: it.name, load: `${/too large/.test(it.error) ? 'skip' : 'fail'}: ${it.error}`, warnings: {} };
  else {
    try { r = runFast(it, { stages: stages.filter(s => FAST_STAGES.includes(s)) }); } catch (e) { r = { name: it.name, load: `fail: exception: ${e.message}`, warnings: {} }; }
    if (it.warnings?.length) r.warnings.load = [...new Set([...(r.warnings.load || []), ...it.warnings])].sort();
    if (r.doc && stages.includes('synth')) {
      const s = await runSynth(r.doc, it.uses, it.hdlUses, it.langs?.[0]);
      r.synth = s.synth; r.quality = s.quality;
      if (s.warnings.length) r.warnings.synth = s.warnings;
    }
    if (r.doc && stages.includes('flow')) Object.assign(r, await runFlow(r.doc, it.uses, it.hdlUses, it.langs?.[0]));
  }
  delete r.doc;
  results[it.name] = r;
  console.log(`${it.name.padEnd(28)} ${STAGES.map(s => (r[s] === undefined ? '-' : String(r[s]).split(':')[0])).join(' ').padEnd(44)} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const s of STAGES) if (r[s] && !/^(pass|complete|skip)/.test(r[s])) console.log(`    ${s}: ${r[s]}`);
}
const expected = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, 'utf8')) : {};
if (a.includes('--update')) {
  const all = updatedExpectations(expected, results);
  fs.writeFileSync(EXPECTED, `${JSON.stringify(all, null, 1)}\n`);
  const text = fs.readFileSync(README, 'utf8');
  fs.writeFileSync(README, text.replace(/<!-- results -->[\s\S]*<!-- \/results -->/, `<!-- results -->\n${table(manifest, all)}\n<!-- /results -->`));
  console.log(`expected.json and the README's table updated (${Object.keys(results).length} schematics)`);
} else {
  const diff = compareExpectations(results, expected, stages);
  for (const x of diff) console.log(`DIFFERENT: ${x.name} ${x.stage}: expected ${x.expected}, got ${x.got}`);
  if (diff.length) process.exit(1);
  console.log(`${items.length} schematics as expected`);
}
