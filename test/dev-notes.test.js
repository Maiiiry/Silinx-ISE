// The pre-release "Development build" (scripts/dev-notes.mjs, .github/workflows/dev-release.yml): its
// text names the commit and lists the changes not released yet (the changelog fragments, an unreleased
// section), never a released version's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { devNotes } from '../scripts/dev-notes.mjs';
import { readFragments } from '../scripts/changelog-release.mjs';

const CL = '# Changelog\n\n## 15.10.9\n\nIn detail:\n\n- **New thing** (#1).\n\n## 15.10.8\n\n- Old thing.\n';

test('dev notes: the commit, the dev site, the newest section when it is not released yet', () => {
  const t = devNotes({ commit: 'abc1234', date: '2026-10-13', changelog: CL, tags: ['v15.10.8'] });
  assert.match(t, /^\*\*Development build\*\* of main, commit abc1234 \(2026-10-13\): not a release/);
  assert.match(t, /https:\/\/pmnmalo\.github\.io\/Silinx-ISE\/dev\//);
  assert.match(t, /## Not released yet \(15\.10\.9\)\n\nIn detail:\n\n- \*\*New thing\*\* \(#1\)\./);
  assert.doesNotMatch(t, /Old thing/);
  // released already: no "not released yet" part
  assert.doesNotMatch(devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8', 'v15.10.9'] }), /Not released yet/);
});

// the changelog fragments (changes/*.md, #519), with the unreleased section written by hand (the
// transition) when there is one
const F = [{ name: '7-old.md', text: 'In detail:\n\n- **Old fix** (#7).\n' },
  { name: '9-new.md', text: 'In short:\n\n- **New:** what users see.\n\nIn detail:\n\n- **New** (#9).\n' }];

test('dev notes: the pending fragments, newest issue first, with or without an unreleased section', () => {
  const t = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8', 'v15.10.9'], fragments: F });
  assert.ok(t.endsWith('## Not released yet\n\nIn short:\n\n- **New:** what users see.\n\nIn detail:\n\n- **New** (#9).\n- **Old fix** (#7).\n'), t);
  assert.doesNotMatch(t, /New thing|Old thing/, 'not the released sections');
  const u = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8'], fragments: F });
  assert.ok(u.endsWith('## Not released yet (15.10.9)\n\nIn short:\n\n- **New:** what users see.\n\nIn detail:\n\n- **New** (#9).\n- **Old fix** (#7).\n- **New thing** (#1).\n'), u);
  // nothing pending: no "not released yet" part
  assert.doesNotMatch(devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8', 'v15.10.9'], fragments: [] }), /Not released yet/);
});

test('scripts/dev-notes.mjs: runs on the repository and lists its fragments, no warnings', () => {
  const r = spawnSync(process.execPath, ['scripts/dev-notes.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'no warnings');
  assert.match(r.stdout, /^\*\*Development build\*\* of main, commit [0-9a-f]+ /);
  for (const f of readFragments()) assert.ok(r.stdout.includes(`#${parseInt(f.name, 10)}`), f.name);
});
