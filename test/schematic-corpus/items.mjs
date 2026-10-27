// The schematic corpus's schematics (#1687) as lib.mjs runs them: { name, doc | ise, ref, refTop, uses }.
//   loadItems(manifest)       the committed ones (manifest.json): a drawing (.sch.json) or an ISE schematic (.sch), its
//                             reference's files, the schematics it instantiates
//   generatedItems({ filter }) the design corpus's designs (test/designs-corpus/manifest.json, fetched), each top
//                             converted to a schematic by Convert to Schematic (core/hdl-to-sch.js), its reference the
//                             design itself; the schematics written to .cache/schematic-corpus/ (never committed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const read = f => fs.readFileSync(path.join(HERE, f), 'utf8');

export function loadItems(manifest) {
  const byName = new Map();
  const items = manifest.schematics.map(s => {
    const it = { name: s.name, source: s.source, ref: s.ref ? s.ref.map(f => ({ path: path.basename(f), text: read(f) })) : null, refTop: s.refTop || null, usesNames: s.uses || [] };
    if (/\.sch$/i.test(s.file)) { it.ise = read(s.file); it.docName = path.basename(s.file, '.sch'); }
    else it.doc = JSON.parse(read(s.file));
    byName.set(s.name, it);
    return it;
  });
  for (const it of items) it.uses = it.usesNames.map(u => ({ name: u, doc: byName.get(u).doc }));
  return items;
}

// the conversion in a process of its own, stopped after `limit` ms or at MEMORY MB
const CONVERT_LIMIT = 120000, MEMORY = 4096;
function convertIn(sources, top, dir, limit = CONVERT_LIMIT) {
  const input = path.join(dir, `${top}.in.json`), output = path.join(dir, `${top}.out.json`);
  fs.writeFileSync(input, JSON.stringify({ sources, top }));
  fs.rmSync(output, { force: true });
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [`--max-old-space-size=${MEMORY}`, fileURLToPath(new URL('./convert-worker.mjs', import.meta.url)), input, output], { timeout: limit, maxBuffer: 1 << 20 }, (err) => {
      fs.rmSync(input, { force: true });
      if (!fs.existsSync(output)) return reject(new Error(err?.killed ? `too large: not drawn in ${limit / 1000} s` : /heap out of memory/.test(err?.message + err?.stderr) ? `too large: out of memory (${MEMORY} MB)` : `the conversion stopped: ${String(err?.message).split('\n')[0]}`));
      const m = JSON.parse(fs.readFileSync(output, 'utf8'));
      fs.rmSync(output, { force: true });
      if (m.error) reject(new Error(m.error)); else resolve(m);
    });
  });
}

export async function generatedItems({ filter = () => true, log = () => {} } = {}) {
  const { fetchDesignCorpus, sourceDir, corpusPaths } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'fetch-design-corpus.mjs')).href);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  const designs = manifest.designs.filter(d => filter(`gen-${d.name}`) && !d.generics);
  await fetchDesignCorpus({ manifest: { ...manifest, designs }, log: () => {} });
  const cache = path.join(path.dirname(corpusPaths(ROOT).results), 'schematic-corpus');
  fs.mkdirSync(cache, { recursive: true });
  const items = [];
  for (const d of designs) {
    const name = `gen-${d.name}`;
    const dir = sourceDir(manifest.sources[d.source]);
    const sources = d.files.map(f => {
      const local = f.startsWith('local:');
      const text = fs.readFileSync(local ? path.join(ROOT, 'test/designs-corpus', f.slice(6)) : path.join(dir, f), 'utf8');
      return { path: local ? f.slice(6) : f, text, role: 'design', lang: /\.vhdl?$/i.test(f) ? 'vhdl' : 'verilog' };
    });
    const t0 = Date.now();
    try {
      const r = await convertIn(sources, d.top, cache);
      // the modules the schematic instantiates stay HDL: the other sources, as they are after the conversion
      const rest = [];
      for (const s of sources) if (!(s.path in r.writes)) rest.push(s); else if (r.writes[s.path] != null && s.path !== r.hdlPath) rest.push({ ...s, text: r.writes[s.path] });
      for (const p of Object.keys(r.newFiles)) if (p !== r.hdlPath) rest.push({ path: p, text: r.writes[p] });
      r.doc.name = r.doc.name || d.top;
      fs.writeFileSync(path.join(cache, `${d.name}.sch.json`), `${JSON.stringify(r.doc, null, 1)}\n`);
      items.push({ name, generated: true, doc: r.doc, langs: [r.doc.lang], ref: sources, refTop: d.top, uses: [], hdlUses: rest, warnings: r.warnings.map(w => `convert: ${w}`) });
      log(`${name}: converted in ${((Date.now() - t0) / 1000).toFixed(1)} s (${r.counts.drawn} symbols, ${r.counts.blocks} HDL blocks)`);
    } catch (e) {
      items.push({ name, error: `convert: ${String(e.message).replace(/\s+/g, ' ').slice(0, 200)}` });
    }
  }
  return items;
}
