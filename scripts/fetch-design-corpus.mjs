#!/usr/bin/env node
// Fetch the open-source designs of the design corpus (test/designs-corpus/manifest.json) at their
// pinned commits, for the corpus runner (test/designs-corpus/run.mjs). They are data: downloaded
// into .cache/designs-corpus/ (git-ignored), never committed. Each design's licence is recorded in
// the manifest (only permissive or copyleft open-source licences); the licence file of each
// repository is fetched beside its files.
//
//   node scripts/fetch-design-corpus.mjs [--force] [--filter name]
//
// Every file comes from https://raw.githubusercontent.com/<repo>/<commit>/<path> (a commit, never a
// branch: the same bytes on every run), into .cache/designs-corpus/<owner>__<repo>/<commit>/<path>.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = path.join(ROOT, 'test', 'designs-corpus', 'manifest.json');
export const CACHE = path.join(ROOT, '.cache', 'designs-corpus');

/** The folder of a pinned source: .cache/designs-corpus/<owner>__<repo>/<commit>. */
export const sourceDir = src => path.join(CACHE, src.repo.replace('/', '__'), src.commit);

/** Every repository path a design needs from its source (its files, its testbench's, the licence). */
export function remoteFiles(manifest, design) {
  const src = manifest.sources[design.source];
  const all = [...design.files, ...(design.testbench?.files || []), src.licenceFile];
  return [...new Set(all.filter(f => !f.startsWith('local:')))];
}

const safe = rel => !rel.split('/').includes('..') && !path.isAbsolute(rel);

/** Download what the designs need (once per file). Returns { fetched, cached }. */
export async function fetchDesignCorpus({ force = false, filter = '', log = console.log, manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) } = {}) {
  let fetched = 0, cached = 0;
  for (const d of manifest.designs) {
    if (filter && !d.name.includes(filter)) continue;
    const src = manifest.sources[d.source];
    const dir = sourceDir(src);
    for (const rel of remoteFiles(manifest, d)) {
      if (!safe(rel)) throw new Error(`${d.name}: unsafe path ${rel}`);
      const out = path.join(dir, rel);
      if (fs.existsSync(out) && !force) { cached++; continue; }
      const url = `https://raw.githubusercontent.com/${src.repo}/${src.commit}/${rel}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${d.name}: ${url}: HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      fetched++;
    }
  }
  log(`design corpus: ${fetched} files fetched, ${cached} cached (${path.relative(ROOT, CACHE)})`);
  return { fetched, cached };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--filter');
  fetchDesignCorpus({ force: a.includes('--force'), filter: i >= 0 ? a[i + 1] : '' }).catch(e => { console.error(e.message); process.exit(1); });
}
