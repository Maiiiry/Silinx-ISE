#!/usr/bin/env node
// The SHA-256 checksums of a release's files (#485), in the format of `sha256sum` / `shasum -a 256`
// ("<64 hex digits>  <name>", sorted by name), so that a download is checked with
// `sha256sum -c SHA256SUMS --ignore-missing`. Written by scripts/package-release.mjs next to the files;
// the Release workflow publishes it and attests the files it lists (actions/attest-build-provenance).
//   node scripts/checksums.mjs <file>...        prints the lines
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUMS_FILE = 'SHA256SUMS';

/** The checksums' text of these files: one line per file, by its base name, sorted. */
export function sha256sums(files) {
  const names = files.map(f => path.basename(f));
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`two files named ${dup}`);
  return files
    .map(f => `${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}  ${path.basename(f)}`)
    .sort((a, b) => a.slice(66) < b.slice(66) ? -1 : 1)
    .map(l => `${l}\n`).join('');
}

/** The lines of a checksums file: [{ sha256, name }]; throws on a malformed line. */
export function parseSums(text) {
  return String(text).split('\n').filter(Boolean).map((line, i) => {
    const m = /^([0-9a-f]{64}) [ *](\S.*)$/.exec(line);
    if (!m) throw new Error(`line ${i + 1}: not "<sha-256>  <name>"`);
    return { sha256: m[1], name: m[2] };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node scripts/checksums.mjs <file>...'); process.exit(2); }
  process.stdout.write(sha256sums(files));
}
