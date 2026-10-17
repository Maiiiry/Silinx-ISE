// scripts/install-adepttool.sh installs third-party code on the user's machine: always the same,
// checked code (a pinned commit of adepttool, the Silinx patch required, libusb1 by its hashes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = fs.readFileSync(path.join(ROOT, 'scripts/install-adepttool.sh'), 'utf8');
const reqs = fs.readFileSync(path.join(ROOT, 'scripts/adepttool-requirements.txt'), 'utf8');

test('install-adepttool: a pinned commit, checked after the checkout, never the moving HEAD', () => {
  const commit = /^COMMIT="([0-9a-f]+)"$/m.exec(script)?.[1];
  assert.match(commit || '', /^[0-9a-f]{40}$/);
  assert.match(script, /checkout --quiet "\$COMMIT"/);
  assert.match(script, /rev-parse HEAD\)" = "\$COMMIT" \] \|\| \{ echo "adepttool: commit \$COMMIT not found"; exit 1; \}/);
  assert.doesNotMatch(script, /pull --ff-only|clone --depth/);
});

test('install-adepttool: the Silinx patch must apply (no silent skip)', () => {
  assert.match(script, /git -C "\$ROOT\/src" apply "\$PATCH" \|\| \{ echo "adepttool: the Silinx patch does not apply to \$COMMIT"; exit 1; \}/);
  assert.doesNotMatch(script, /apply --check/);
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/adepttool-silinx.patch')));
});

test('install-adepttool: Python packages only by exact version and hash', () => {
  assert.match(script, /pip install --quiet --require-hashes -r "\$HERE\/adepttool-requirements\.txt"/);
  // no other pip install (an unpinned pip upgrade or package)
  assert.equal(script.match(/pip install/g).length, 1);
  const pins = reqs.replace(/\\\n/g, ' ').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  assert.ok(pins.length >= 1);
  for (const l of pins) {
    assert.match(l, /^[\w-]+==\d+(\.\d+)+\s/, l);
    assert.match(l, /--hash=sha256:[0-9a-f]{64}/, l);
  }
});

test('install-adepttool: valid bash', { skip: process.platform === 'win32' }, () => {
  execFileSync('bash', ['-n', path.join(ROOT, 'scripts/install-adepttool.sh')]);
});
