#!/usr/bin/env node
// The text of the GitHub release of a version: its "What's new" section from CHANGELOG.md, then
// the common part (.github/release-notes.md: downloads, licence note).
//   node scripts/release-notes.mjs 15.9.3 [--require] [--sums out/SHA256SUMS] > notes.md
// --require: fail when CHANGELOG.md has no section for that version.
// --sums: the files' checksums (scripts/checksums.mjs) and how to check a download, at the end (#485).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changesOf, releaseNotes } from '../core/changelog.js';
import { parseSums } from './checksums.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = String(process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error('usage: node scripts/release-notes.mjs <version> [--require]'); process.exit(2); }
const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (!changesOf(md, version)) {
  const msg = `CHANGELOG.md has no "## ${version}" section: write what changed in ${version} first.`;
  if (process.argv.includes('--require')) { console.error(msg); process.exit(1); }
  console.error(`warning: ${msg}`);
}
const common = fs.readFileSync(path.join(root, '.github/release-notes.md'), 'utf8');
const at = process.argv.indexOf('--sums');
let sums;
if (at >= 0) {
  sums = fs.readFileSync(process.argv[at + 1], 'utf8');
  parseSums(sums);
  if (!sums.trim()) { console.error(`${process.argv[at + 1]}: no checksum`); process.exit(1); }
}
process.stdout.write(releaseNotes(md, version, common, sums));
