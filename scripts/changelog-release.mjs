#!/usr/bin/env node
// A release's changelog (#519): assembles the changelog fragments (changes/<issue>-<slug>.md, one per
// change, see changes/README.md) into the "## <version>" section at the top of CHANGELOG.md, newest issue
// first, and deletes them. When the version has a section already (written by hand), the fragments' items
// are added to its lists. The first step of a release, before `npm version` (whose scripts/sync-version.mjs
// needs the section and no fragment left); the releaser may then edit the section (an introduction, a
// shorter "In short:") before the version's commit.
//   node scripts/changelog-release.mjs 15.11.2 [--dry-run]
// --dry-run: print the section, change nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRelease, changesOf, checkFragments } from '../core/changelog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FRAGMENTS_DIR = path.join(ROOT, 'changes');

/** The fragments of a folder ([{ name, text }], by name): its .md files but its README.md. */
export function readFragments(dir = FRAGMENTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').sort()
    .map(name => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function main() {
  const version = String(process.argv[2] || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error('usage: node scripts/changelog-release.mjs <version> [--dry-run]'); process.exit(2); }
  const files = readFragments();
  const bad = checkFragments(files);
  if (bad.length) { console.error(`changes/: malformed fragments:\n${bad.map(b => `  ${b}`).join('\n')}`); process.exit(1); }
  const file = path.join(ROOT, 'CHANGELOG.md');
  let md;
  try { md = assembleRelease(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version, files); }
  catch (e) { console.error(e.message); process.exit(1); }
  if (process.argv.includes('--dry-run')) { process.stdout.write(`## ${version}\n\n${changesOf(md, version).body}\n`); return; }
  fs.writeFileSync(file, md);
  for (const { name } of files) fs.rmSync(path.join(FRAGMENTS_DIR, name));
  console.log(`CHANGELOG.md: ${files.length} fragment(s) assembled into "## ${version}" and deleted from changes/.`);
}

// (run, not imported; the real paths: macOS's temporary folder is a symbolic link)
if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) main();
