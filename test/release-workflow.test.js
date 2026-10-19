// The Release workflow's checksums and build provenance (#485): SHA256SUMS written with the packages and
// published among them and in the notes, the files attested by GitHub (actions/attest-build-provenance)
// before they are published, with the permissions that needs and no more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
const steps = yml.slice(yml.indexOf('\n    steps:\n')).split(/\n(?= {6}- )/).slice(1);
const step = (re) => { const i = steps.findIndex(s => re.test(s)); assert.ok(i >= 0, String(re)); return [i, steps[i]]; };

test('release workflow: the permissions of the attestation, on a tag push only', () => {
  assert.match(yml, /\non:\n {2}push:\n {4}tags: \['v\*'\]\npermissions:\n/);
  const perms = /\npermissions:\n((?: {2}.*\n)+)/.exec(yml)[1].replace(/ *#.*$/gm, '').trim().split('\n').map(l => l.trim());
  assert.deepEqual(perms, ['actions: read', 'attestations: write', 'contents: write', 'id-token: write']);
  // one job, no other permissions block
  assert.equal(yml.match(/permissions:/g).length, 1);
});

test('release workflow: packaged (with SHA256SUMS), checked, attested, then published with the checksums in the notes', () => {
  const [pkg, pkgStep] = step(/name: Package\n/);
  assert.match(pkgStep, /run: node scripts\/package-release\.mjs "\$\{GITHUB_REF_NAME#v\}" --out out/);
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/package-release.mjs'), 'utf8'), /\nfs\.writeFileSync\(path\.join\(out, SUMS_FILE\), sha256sums\(made\)\);\n/);
  const [check] = step(/run: npm run test:release\n/);
  const [attest, attestStep] = step(/name: Build provenance\n/);
  assert.match(attestStep, /uses: actions\/attest-build-provenance@[0-9a-f]{40} # v\d+\.\d+\.\d+\n {8}with:\n {10}subject-checksums: out\/SHA256SUMS\n?$/);
  const [publish, publishStep] = step(/name: Publish\n/);
  assert.ok(pkg < check && check < attest && attest < publish, 'package, check, attest, publish');
  assert.equal(publish, steps.length - 1);
  assert.match(publishStep, /node scripts\/release-notes\.mjs "\$V" --require --sums out\/SHA256SUMS > out-notes\.md\n/);
  // out/* holds SHA256SUMS: it is a file of the release
  assert.match(publishStep, /gh release create "\$GITHUB_REF_NAME" out\/\* --title "Silinx ISE \$V" --notes-file out-notes\.md/);
});

test('docs: how to check a download (README, docs/)', () => {
  for (const f of ['README.md', 'docs/GETTING-STARTED.md', 'docs/COMECAR.md']) {
    const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const s of ['SHA256SUMS', 'sha256sum -c SHA256SUMS --ignore-missing', 'gh attestation verify']) assert.ok(md.includes(s), `${f}: ${s}`);
  }
});
