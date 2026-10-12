// UI: the harness itself. One UI test runs alone (node --test --test-name-pattern), here a test that
// is not the first of its file, in a node of its own (#64).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, BROWSER, findChrome, missingDependencies, dependenciesMessage } from './harness.js';

const skip = BROWSER === 'chrome' && !findChrome() ? 'Google Chrome / Chromium not found (set CHROME_PATH): UI tests skipped' : undefined;

test('one UI test alone with --test-name-pattern (the second of hints.test.js)', { timeout: 180000, skip }, () => {
  const missing = missingDependencies();
  assert.deepEqual(missing, [], dependenciesMessage(missing));
  const name = 'Verilog: unused bits of an input bus';
  // (NODE_TEST_CONTEXT: this test's runner, not one of the child's own)
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=^${name}`, path.join(ROOT, 'test/ui/hints.test.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 170000 });
  const out = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, out);
  assert.match(out, new RegExp(`^ok 1 - ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'), out);
  assert.match(out, /^# tests 1$/m, out);
  assert.match(out, /^# pass 1$/m, out);
  assert.match(out, /^# fail 0$/m, out);
  assert.doesNotMatch(out, /reading 'fold'|page errors/, out);
});
