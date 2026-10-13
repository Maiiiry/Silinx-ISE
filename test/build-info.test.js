// The version a build shows (#135): the release's build (the commit tagged v<VERSION>) the version
// alone; any other commit "dev:abc1234 (2026-10-13 11:12)" (the same in
// Portuguese); outside a git checkout the version alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildInfo } from '../scripts/build-info.mjs';
import { VERSION, BUILD, VERSION_LABEL, versionLabel } from '../core/version.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');

test('build info: a development commit, the release\'s tag, no git', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-build-'));
  try {
    assert.equal(buildInfo(dir, '1.2.3', {}), null, 'not a git checkout: the version alone');
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
    git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'a');
    const head = git('rev-parse', '--short=7', 'HEAD');
    const day = git('log', '-1', '--date=format:%Y-%m-%d %H:%M', '--format=%cd', 'HEAD');
    assert.deepEqual(buildInfo(dir, '1.2.3', {}), { commit: head, date: day });
    // the release workflow: its tag's push
    assert.equal(buildInfo(dir, '1.2.3', { GITHUB_REF: 'refs/tags/v1.2.3' }), null);
    assert.deepEqual(buildInfo(dir, '1.2.3', { GITHUB_REF: 'refs/heads/main' }), { commit: head, date: day });
    git('tag', 'v1.2.2');
    assert.deepEqual(buildInfo(dir, '1.2.3', {}), { commit: head, date: day }, 'another version\'s tag');
    git('tag', 'v1.2.3');
    assert.equal(buildInfo(dir, '1.2.3', {}), null, 'the release\'s commit');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('version label: the version alone, or the development commit (English and Portuguese)', () => {
  // the server and the tests (no __SILINX_BUILD__ defined): the version alone
  assert.equal(BUILD, null);
  assert.equal(VERSION_LABEL, VERSION);
  assert.equal(versionLabel(null), VERSION);
  assert.equal(versionLabel({ commit: 'abc1234' }), 'dev:abc1234');
  assert.equal(versionLabel({ commit: 'abc1234', date: '2026-10-13 11:12' }), 'dev:abc1234 (2026-10-13 11:12)');
  assert.equal(t('Silinx ISE dev:abc1234 (2026-10-13 11:12)'), 'Silinx ISE dev:abc1234 (2026-10-13 11:12)');
  assert.equal(t(versionLabel({ commit: 'abc1234' })), 'dev:abc1234');
  assert.equal(t('Silinx ISE dev:abc1234 (2026-10-13 11:12) Project Navigator'), 'Silinx ISE dev:abc1234 (2026-10-13 11:12) Project Navigator');
});
