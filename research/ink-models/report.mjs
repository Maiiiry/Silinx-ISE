#!/usr/bin/env node
// The README's tables from results/*.json, the answers scored again with score.js (#1060).
// Copyright 2026 Pedro Maló, AGPL-3.0-only.
//   node research/ink-models/report.mjs [results/x.json …]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './models.js';
import { score } from './score.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const samples = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DIR, 'samples.json'), 'utf8')).map(s => [s.id, s]));
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(DIR, 'results')).filter(f => f.endsWith('.json')).map(f => path.join(DIR, 'results', f));

const mean = xs => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '–';
for (const file of files) {
  const { env, runs } = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n### ${path.basename(file)}\n\n${env.cores} cores, WebGPU ${env.webgpu ? env.webgpu.architecture : 'no'}, ` +
    `cross-origin isolated ${env.crossOriginIsolated ? 'yes' : 'no'}, Transformers.js ${env.transformers}\n`);
  console.log('| Model | Backend | Download | Cold load | Warm load | Memory (peak +) | Median / sample | Expressions | Tables | Schematics |');
  console.log('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const r of runs) {
    if (r.error) { console.log(`| ${MODELS[r.model].label} | ${r.backend} | failed: ${r.error} |||||||| `); continue; }
    const sc = k => mean(r.samples.filter(s => s.kind === k).map(s => score(samples[s.id], s.text).score));
    const opt = r.query ? ` (${decodeURIComponent(r.query.slice(1))})` : '';
    console.log(`| ${MODELS[r.model].label} | ${r.backend}${opt}, ${r.threads ?? '?'} threads | ${r.loadedMBCold ?? r.loadedMB} MB | ` +
      `${r.coldLoadS ?? '–'} s | ${r.loadS} s | ${r.rssPeakIncreaseMB ?? r.memoryAfterRunMB ?? '–'} MB | ${r.medianS} s | ` +
      `${sc('expression')} | ${sc('table')} | ${sc('schematic')} |`);
  }
  if (process.env.ANSWERS) {
    for (const r of runs.filter(x => !x.error)) {
      console.log(`\n${MODELS[r.model].label}, ${r.backend}:\n`);
      for (const s of r.samples) console.log(`- ${s.id} (${score(samples[s.id], s.text).score.toFixed(2)}): \`${s.text.replace(/`/g, "'").slice(0, 160)}\``);
    }
  }
}
