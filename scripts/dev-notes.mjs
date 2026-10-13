#!/usr/bin/env node
// The text of the pre-release "Development build" (.github/workflows/dev-release.yml): the commit,
// where to find it, and the changes not released yet (CHANGELOG.md's newest section, when no tag v<it>
// exists).   node scripts/dev-notes.mjs > notes.md
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from '../core/changelog.js';

export function devNotes({ commit, date, changelog, tags }) {
  const top = parseChangelog(changelog)[0];
  const out = [`**Development build** of main, commit ${commit} (${date}): not a release, for testing.`,
    'The latest release is under Releases; this one is replaced after every change that passes the tests.',
    'In the browser: https://pmnmalo.github.io/Silinx-ISE/dev/', ''];
  if (top && !tags.includes(`v${top.version}`)) out.push(`## Not released yet (${top.version})`, '', top.body.trim(), '');
  return out.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  process.stdout.write(devNotes({ commit: git('rev-parse', '--short', 'HEAD'), date: git('log', '-1', '--format=%ci'),
    changelog: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), tags: git('tag').split('\n') }));
}
