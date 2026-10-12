// The scheduled workflows skip when main has nothing new to test (#148): scripts/changed-since-last-run.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decide, irrelevant } from '../scripts/changed-since-last-run.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40);

test('changed since the last run: a run by hand always runs; a scheduled one only when there is something new', () => {
  assert.deepEqual(decide({ event: 'workflow_dispatch', current: A, last: A, changed: [] }), { run: true, reason: 'started by workflow_dispatch' });
  assert.equal(decide({ event: 'schedule', current: A, last: null }).run, true, 'no successful run before');
  assert.deepEqual(decide({ event: 'schedule', current: A, last: A }), { run: false, reason: 'main is aaaaaaa, as at the last successful run' });
  assert.equal(decide({ event: 'schedule', current: B, last: A, changed: null }).run, true, 'the last commit is not in the history (a forced push)');
  assert.deepEqual(decide({ event: 'schedule', current: B, last: A, changed: ['README.md', 'docs/QUALITY.md', 'test/designs-corpus/ise-comparison.json'] }),
    { run: false, reason: 'since aaaaaaa (the last successful run) only documentation changed (3 file(s))' });
  assert.deepEqual(decide({ event: 'schedule', current: B, last: A, changed: ['README.md', 'core/ucf.js'] }),
    { run: true, reason: '1 file(s) changed since aaaaaaa (the last successful run): core/ucf.js' });
});

test('changed since the last run: the files that cannot change a result', () => {
  for (const f of ['README.md', 'CHANGELOG.md', 'docs/COMECAR.md', 'docs/QUALITY.md', 'test/designs-corpus/ise-comparison.json', 'test/corpus/README.md']) assert.ok(irrelevant(f), f);
  for (const f of ['core/ucf.js', 'test/designs-corpus/expected.json', 'examples/gates/src/gates.vhd', '.github/workflows/ise.yml', 'package.json']) assert.ok(!irrelevant(f), f);
});

test('changed since the last run: the long scheduled workflows are gated on it, never on the self-hosted runner', () => {
  for (const [file, gated] of [['nightly.yml', ['corpus', 'vloghammer', 'designs']], ['ise.yml', ['ise']], ['quality.yml', ['compare']]]) {
    const yml = fs.readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    assert.match(yml, new RegExp(`node scripts/changed-since-last-run\\.mjs ${file.replace('.', '\\.')}`), file);
    // the check itself on a GitHub-hosted runner, with the history
    assert.match(yml, /changes:\n(?:.*\n)*?\s+runs-on: ubuntu-latest\n(?:.*\n)*?\s+fetch-depth: 0/, file);
    for (const job of gated) assert.match(yml, new RegExp(`\\n  ${job}:\\n(?:    .*\\n)*?    needs: changes\\n(?:    .*\\n)*?    if: .*needs\\.changes\\.outputs\\.run == 'true'`), `${file}: ${job}`);
  }
});

test('CI: not run for documentation only; the documentation\'s tests run then (#149)', () => {
  const read = f => fs.readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8');
  const ci = read('ci.yml'), docs = read('docs.yml');
  // the same documentation files: ignored by CI, the trigger of Docs, and irrelevant to the scheduled runs
  for (const ev of ['push', 'pull_request']) {
    assert.match(ci, new RegExp(`\\n  ${ev}:\\n(?:    .*\\n)*?    paths-ignore: \\['\\*\\*\\.md', 'docs/\\*\\*'\\]`), `ci.yml ${ev}`);
    assert.match(docs, new RegExp(`\\n  ${ev}:\\n(?:    .*\\n)*?    paths: \\['\\*\\*\\.md', 'docs/\\*\\*'\\]`), `docs.yml ${ev}`);
  }
  for (const f of ['README.md', 'docs/QUALITY.md']) assert.ok(irrelevant(f), f);
  // the tests of the documentation, all of them
  for (const t of ['docs', 'changelog', 'quality-page']) {
    assert.ok(fs.existsSync(new URL(`./${t}.test.js`, import.meta.url)), t);
    assert.match(docs, new RegExp(`test/${t}\\.test\\.js`), t);
  }
});
