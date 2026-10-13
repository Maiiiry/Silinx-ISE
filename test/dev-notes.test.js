// The pre-release "Development build" (scripts/dev-notes.mjs, .github/workflows/dev-release.yml): its
// text names the commit and lists the changes not released yet, never a released version's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { devNotes } from '../scripts/dev-notes.mjs';

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
