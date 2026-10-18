// The workflows' least privilege (#479): every workflow says at the top what its token may do (the ones
// that only test the code read the repository; the ones that publish say what they write, for every job
// of theirs), and the self-hosted runner (the maintainer's machine: ise.yml, quality.yml) installs the
// dependencies without their install scripts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
// the workflows that only test: a read-only token for every job; the others (a release, the development
// site, the quality results' branch) write, and say so at the top
const READ_ONLY = ['ci.yml', 'nightly.yml', 'ise.yml', 'pins.yml', 'yosys-update.yml'];

test('every workflow states its permissions at the top; the testing ones read the repository only', () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.yml'));
  for (const f of READ_ONLY) assert.ok(files.includes(f), f);
  for (const f of files) {
    const yml = read(f);
    const m = /\npermissions:\n((?:  \S.*\n)+)/.exec(yml);
    assert.ok(m, `${f}: top-level permissions`);
    if (READ_ONLY.includes(f)) assert.equal(m[1].replace(/\s+#.*/, ''), '  contents: read\n', `${f}: a read-only token`);
  }
});

test('the self-hosted runner installs the dependencies without their install scripts', () => {
  for (const f of ['ise.yml', 'quality.yml']) {
    const yml = read(f);
    assert.match(yml, /runs-on: \[self-hosted, ise\]/, f);
    // npm ci is the setup action's (.github/actions/setup): the job's environment tells npm to skip the scripts
    const job = /\n    runs-on: \[self-hosted, ise\]\n([\s\S]*?)\n    steps:/.exec(yml);
    assert.ok(job, `${f}: the self-hosted job`);
    assert.match(job[1], /\n    env:\n(?:      .*\n)*      NPM_CONFIG_IGNORE_SCRIPTS: 'true'(\n|$)/, `${f}: NPM_CONFIG_IGNORE_SCRIPTS in the job's env`);
    assert.doesNotMatch(yml, /npm install\b/, f);
  }
});
