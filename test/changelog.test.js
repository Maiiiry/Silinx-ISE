// CHANGELOG.md: one section per release (every git tag and the current version), the parser, the
// GitHub release text (What's new + the common part) and what an update brings. The changes not
// released yet are changelog fragments (changes/*.md, #519: test/changelog-fragments.test.js), which a
// release assembles into its section, so the newest section is the current version's (or one written by
// hand for the next version, being prepared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseChangelog, changesOf, changesSince, releaseNotes } from '../core/changelog.js';
import { compareVersions, VERSION } from '../core/version.js';

const MD = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

test('parser: sections, one version, the versions between two releases', () => {
  const md = '# Changelog\n\nintro\n\n## 2.1.0\n\n- c\n  more c\n\n## 2.0.0\n- b\n\n## v1.0.0\n- a\n';
  assert.deepEqual(parseChangelog(md).map(s => s.version), ['2.1.0', '2.0.0', '1.0.0']);
  assert.equal(changesOf(md, 'v2.0.0').body, '- b');
  assert.equal(changesOf(md, '3.0.0'), null);
  assert.deepEqual(changesSince(md, '1.0.0', '2.1.0').map(s => s.version), ['2.1.0', '2.0.0']);
  assert.deepEqual(changesSince(md, '2.0.0').map(s => s.version), ['2.1.0']);
  const notes = releaseNotes(md, '2.1.0', 'COMMON');
  assert.match(notes, /^## What's new in 2\.1\.0\n\n- c\n  more c\n\nCOMMON\n$/);
  assert.equal(releaseNotes(md, '9.9.9', 'COMMON'), 'COMMON\n');
});

test('CHANGELOG.md: a section for the current version and for every released tag, newest first', () => {
  const secs = parseChangelog(MD);
  const versions = secs.map(s => s.version);
  assert.ok(versions.includes(VERSION) || compareVersions(versions[0], VERSION) > 0, `a section for ${VERSION} (or a newer one being prepared)`);
  let tags = [];
  try { tags = execFileSync('git', ['tag'], { encoding: 'utf8' }).split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t)).map(t => t.slice(1)); } catch { /* no git (release zip) */ }
  for (const t of tags) assert.ok(versions.includes(t), `CHANGELOG.md has no section for ${t}`);
  for (let i = 1; i < versions.length; i++) assert.ok(compareVersions(versions[i - 1], versions[i]) > 0, `${versions[i - 1]} before ${versions[i]}`);
  for (const s of secs) assert.match(s.body, /^- /m, `${s.version} lists its changes`);
});

test('scripts/release-notes.mjs: the release text of a version; --require fails without a section', () => {
  const out = execFileSync(process.execPath, ['scripts/release-notes.mjs', parseChangelog(MD)[0].version], { encoding: 'utf8' });
  assert.match(out, /^## What's new in \d+\.\d+\.\d+\n/);
  assert.match(out, /## Downloads/);
  assert.throws(() => execFileSync(process.execPath, ['scripts/release-notes.mjs', '0.0.99', '--require'], { stdio: 'pipe' }), /CHANGELOG\.md has no/);
});

test('release notes: the files\' checksums and how to check a download, at the end (#485)', () => {
  const md = '# Changelog\n\n## 2.1.0\n\n- c\n';
  const sums = `${'a'.repeat(64)}  Silinx-ISE.html\n${'b'.repeat(64)}  silinx-ise-2.1.0.zip\n`;
  const notes = releaseNotes(md, '2.1.0', 'COMMON', sums);
  assert.ok(notes.startsWith('## What\'s new in 2.1.0\n\n- c\n\nCOMMON\n\n## Checking a download\n\nThe files\' SHA-256 checksums (the file SHA256SUMS):\n\n```\n'
    + `${'a'.repeat(64)}  Silinx-ISE.html\n${'b'.repeat(64)}  silinx-ise-2.1.0.zip\n\`\`\`\n\n`), notes);
  for (const cmd of ['sha256sum -c SHA256SUMS --ignore-missing', 'shasum -a 256 -c SHA256SUMS --ignore-missing', 'Get-FileHash <file>', 'gh attestation verify <file> --repo pmnmalo/Silinx-ISE'])
    assert.ok(notes.includes(`\`${cmd}\``), cmd);
  assert.ok(notes.endsWith('.\n'));
  // without the checksums, as before
  assert.equal(releaseNotes(md, '2.1.0', 'COMMON'), '## What\'s new in 2.1.0\n\n- c\n\nCOMMON\n');

  // the script reads them from the file (--sums), and refuses a malformed or empty one
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-notes-'));
  try {
    const version = parseChangelog(MD)[0].version;
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), sums);
    const out = execFileSync(process.execPath, ['scripts/release-notes.mjs', version, '--sums', path.join(dir, 'SHA256SUMS')], { encoding: 'utf8' });
    assert.match(out, /## Downloads[\s\S]*## Checking a download\n[\s\S]*b{64} {2}silinx-ise-2\.1\.0\.zip\n```\n/);
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), 'not a sum\n');
    assert.throws(() => execFileSync(process.execPath, ['scripts/release-notes.mjs', version, '--sums', path.join(dir, 'SHA256SUMS')], { stdio: 'pipe' }), /line 1: not "<sha-256>  <name>"/);
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), '');
    assert.throws(() => execFileSync(process.execPath, ['scripts/release-notes.mjs', version, '--sums', path.join(dir, 'SHA256SUMS')], { stdio: 'pipe' }), /no checksum/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
