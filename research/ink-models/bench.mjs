#!/usr/bin/env node
// Runs the spike page in the installed Chrome (or Playwright's WebKit, Safari's engine: SPIKE_BROWSER=webkit),
// headless, for every model and backend, and writes
// results/<name>.json (#1060). Copyright 2026 Pedro Maló, AGPL-3.0-only.
//   node research/ink-models/bench.mjs [name] [model…]
//   SPIKE_BACKENDS=webgpu,wasm (default both)   SPIKE_QUERY='threads=1' (the page's options)
// Per model and backend: a cold load (the model cache cleared: download included), then in a
// freshly started browser (same profile, so the cache stays) a warm load and the 10 samples, while
// the browser's resident memory (every Chrome process, the GPU process included) is sampled every
// half second; the peak's increase over the empty page is reported.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const [name = 'mac', ...only] = process.argv.slice(2);
const backends = (process.env.SPIKE_BACKENDS || 'webgpu,wasm').split(',');
const PORT = 8791;

const server = spawn(process.execPath, [path.join(DIR, 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const QUERY = process.env.SPIKE_QUERY ? `?${process.env.SPIKE_QUERY}` : '';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-models-profile-'));
let context;
async function relaunch() {
  await context?.close();
  context = process.env.SPIKE_BROWSER === 'webkit' ? await webkit.launchPersistentContext(PROFILE)
    : await chromium.launchPersistentContext(PROFILE, { channel: process.env.SPIKE_CHANNEL ?? 'chrome', args: ['--enable-unsafe-webgpu'] });
}
await relaunch();

function descendants(pid) {
  let out = [];
  try {
    for (const c of execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).split('\n').filter(Boolean)) out.push(+c, ...descendants(+c));
  } catch { /* none */ }
  return out;
}
// The browser's processes all name its profile folder.
function rssMB() {
  let roots;
  try { roots = execFileSync('pgrep', ['-f', PROFILE], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch { return null; }
  const pids = [...new Set(roots.flatMap(p => [p, ...descendants(p)]))];
  const kb = execFileSync('ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' }).split('\n').filter(Boolean).reduce((a, b) => a + +b, 0);
  return Math.round(kb / 1024);
}

async function openPage() {
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('  page:', m.text()); });
  await page.goto(`http://localhost:${PORT}/${QUERY}`);
  await page.waitForFunction(() => window.spike?.ready, null, { timeout: 120000 });
  return page;
}

const all = { env: null, runs: [] };
const page0 = await openPage();
all.env = await page0.evaluate(() => window.spike.results.env);
await page0.close();
const models = only.length ? only : ['trocr-small', 'smolvlm-256m', 'florence2-base'];

for (const backend of backends) {
  if (backend === 'webgpu' && !all.env.webgpu) { console.log('No WebGPU here: skipped'); continue; }
  for (const key of models) {
    console.log(`${key} on ${backend}`);
    try {
      let page = await openPage();
      const cold = await page.evaluate(async ([k, b]) => { await caches.delete('transformers-cache'); return window.spike.loadModel(k, b); }, [key, backend]);
      await relaunch();
      page = await openPage();
      await new Promise(r => setTimeout(r, 2000));
      const base = rssMB();
      let peak = base;
      const timer = setInterval(() => { peak = Math.max(peak, rssMB() ?? 0); }, 500);
      const run = await page.evaluate(async ([k, b]) => window.spike.runSamples(await window.spike.loadModel(k, b)), [key, backend]);
      clearInterval(timer);
      run.query = QUERY;
      run.coldLoadS = cold.loadS;
      run.loadedMBCold = cold.loadedMB;
      run.rssBaseMB = base;
      run.rssPeakIncreaseMB = base == null || process.env.SPIKE_BROWSER === 'webkit' ? null : peak - base; // WebKit's processes are not the profile's
      all.runs.push(run);
      console.log(`  cold ${run.coldLoadS} s, warm ${run.loadS} s, median ${run.medianS} s, +${run.rssPeakIncreaseMB} MB, ` +
        `scores e ${run.expressionScore} t ${run.tableScore} s ${run.schematicScore}`);
      for (const s of run.samples) console.log(`    ${s.id} ${s.s}s ${s.score.toFixed(2)} ${JSON.stringify(s.text).slice(0, 140)}`);
      await page.close();
    } catch (e) {
      console.log(`  failed: ${e.message.split('\n')[0]}`);
      all.runs.push({ model: key, backend, error: e.message.split('\n')[0] });
    }
    fs.writeFileSync(path.join(DIR, 'results', `${name}.json`), JSON.stringify(all, null, 2) + '\n');
  }
}
await context.close();
fs.rmSync(PROFILE, { recursive: true, force: true });
server.kill();
