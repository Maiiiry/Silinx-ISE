#!/usr/bin/env node
// What a push or pull request changes, for CI (#409): CI runs on every push and pull request (no
// paths-ignore: the required check, ci-ok, must always be reported), and its long jobs (the UI tests,
// the other browsers, the operating systems, the standalone build, the release zip) only when more than
// the documentation changed. The unit tests always run: they include the documentation's tests
// (test/docs.test.js, test/changelog.test.js, test/quality-page.test.js) and the tests that read a page
// of it. The Markdown files that a build reads are code: CHANGELOG.md (the release and development
// notes), THIRD-PARTY-NOTICES.md (the single-file edition's notices), .github/release-notes.md. The
// changelog fragments (changes/*.md, #519) are documentation: no build or package reads them, the unit
// tests check them (test/changelog-fragments.test.js), and the development build's notes read them when
// published, after any green CI on main (.github/workflows/dev-release.yml), whatever it ran.
//
//   node scripts/ci-changes.mjs <base> <head>
//   (in GitHub Actions, a checkout with the history: fetch-depth: 0) → writes code=true|false to
//   GITHUB_OUTPUT and the reason to the summary; <base> missing or not in the history (a new branch,
//   a forced push): code=true
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The Markdown files that a build or a release reads: a change of one is a change of code. */
export const BUILD_INPUTS = ['CHANGELOG.md', 'THIRD-PARTY-NOTICES.md', '.github/release-notes.md'];

/** Whether a file is documentation only (no build, package or release reads it). */
export const documentation = f => (/\.md$/i.test(f) || f.startsWith('docs/')) && !BUILD_INPUTS.includes(f);

/** { code, reason } from the files changed (null: unknown). */
export function decide(changed) {
  if (changed == null) return { code: true, reason: 'the changed files are not known (a new branch, or the base is not in the history)' };
  const code = changed.filter(f => !documentation(f));
  if (!code.length) return { code: false, reason: `only documentation changed (${changed.length} file(s)): the unit tests only` };
  return { code: true, reason: `${code.length} file(s) besides the documentation changed: ${code.slice(0, 5).join(', ')}${code.length > 5 ? ', …' : ''}` };
}

/** The files changed from base to head, or null when base is missing or not in the history. */
export function changedFiles(base, head, cwd = process.cwd()) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd, stdio: 'ignore' });
    return execFileSync('git', ['diff', '--name-only', base, head], { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch { return null; }
}

function main() {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  const { code, reason } = decide(changedFiles(base, head));
  console.log(`${code ? 'code' : 'documentation'}: ${reason}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${code ? 'All the jobs' : 'The unit tests only'}: ${reason}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
