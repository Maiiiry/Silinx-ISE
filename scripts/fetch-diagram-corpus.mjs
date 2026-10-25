// The Petri nets of the diagram corpus (#205): Model Checking Contest models (test/diagram-corpus/mcc.json),
// fetched for testing only, never committed. Each archive is checked against its SHA-256, then only the
// net used is kept: <main checkout>/.cache/diagram-corpus/mcc/<instance>.pnml (shared by the worktrees,
// like the design corpus).
//   node scripts/fetch-diagram-corpus.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mainCheckout } from './fetch-design-corpus.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MCC_MANIFEST = path.join(ROOT, 'test', 'diagram-corpus', 'mcc.json');
const MCC_CACHE = path.join(mainCheckout(ROOT), '.cache', 'diagram-corpus', 'mcc');
export const netFile = net => path.join(MCC_CACHE, `${net.instance}.pnml`);

/** Fetch the nets not in the cache yet. Returns { fetched, cached }. */
export async function fetchMcc({ force = false, log = console.log, manifest = JSON.parse(fs.readFileSync(MCC_MANIFEST, 'utf8')) } = {}) {
  let fetched = 0, cached = 0;
  fs.mkdirSync(MCC_CACHE, { recursive: true });
  for (const net of manifest.nets) {
    const out = netFile(net);
    if (!force && fs.existsSync(out)) { cached++; continue; }
    if (!/^https:\/\/mcc\.lip6\.fr\//.test(net.url) || net.file.split('/').includes('..')) throw new Error(`${net.instance}: not an MCC archive or path`);
    log(`fetch ${net.url}`);
    const res = await fetch(net.url);
    if (!res.ok) throw new Error(`${net.url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== net.sha256) throw new Error(`${net.url}: SHA-256 ${sha}, expected ${net.sha256}`);
    // the one net, out of the archive (a folder of its own, removed after)
    const tmp = fs.mkdtempSync(path.join(MCC_CACHE, '.x-'));
    try {
      fs.writeFileSync(path.join(tmp, 'a.tar.gz'), buf);
      execFileSync('tar', ['-xzf', 'a.tar.gz', net.file], { cwd: tmp, stdio: 'ignore' });
      fs.renameSync(path.join(tmp, net.file), `${out}.part`);
      fs.renameSync(`${out}.part`, out);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    fetched++;
  }
  return { fetched, cached };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await fetchMcc({ force: process.argv.includes('--force') });
  console.log(`${r.fetched} fetched, ${r.cached} already there (${MCC_CACHE})`);
}
