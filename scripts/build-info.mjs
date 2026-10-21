// What the single-file edition says of the commit it was built from (#135): a release's build (the
// commit tagged v<VERSION>) shows the version alone; any other commit (GitHub Pages publishes main
// after every CI run that passed, before the release is tagged) shows "dev:abc1234
// (2026-10-13 11:12)" (the commit and its date, no version), so that the site is not taken for the release. Outside a git checkout (a release's
// source archive): the version alone.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** null for the release's commit (or no git), else { commit, date } (the short hash, the commit's date and time, YYYY-MM-DD HH:MM). */
export function buildInfo(root, version, env = process.env) {
  // the release workflow (a pushed tag v<VERSION>, its shallow checkout)
  if (env.GITHUB_REF === `refs/tags/v${version}`) return null;
  let commit;
  try { commit = git(root, 'rev-parse', '--short=7', 'HEAD'); } catch { return null; }
  let tags = [];
  try { tags = git(root, 'tag', '--points-at', 'HEAD').split('\n'); } catch { /* none */ }
  if (tags.includes(`v${version}`)) return null;
  let date = null;
  try { date = git(root, 'log', '-1', '--date=format:%Y-%m-%d %H:%M', '--format=%cd', 'HEAD') || null; } catch { /* none */ }
  return { commit, date };
}

/**
 * A development build's changes since the last release, for its Development menu: { since, changes }, since the
 * newest tag v<X.Y.Z> (null without one), changes as core/changelog.js buildChanges, each typed by its issue's
 * labels from GitHub's API, asked only with a token (env.GITHUB_TOKEN: the publishing workflows', with issues: read),
 * which only authenticates the requests and is never part of the result. Without a token (a build on a developer's
 * machine, the tests) nothing is asked, and a failed request leaves its change 'other'.
 * o.fetch, o.files and o.tags replace the network, changes/ and git (the tests).
 */
export async function devChanges(root, { env = process.env, fetch = globalThis.fetch, files, tags } = {}) {
  const { readFragments } = await import('./changelog-release.mjs');
  const { buildChanges } = await import('../core/changelog.js');
  const { REPOSITORY, compareVersions } = await import('../core/version.js');
  files ??= readFragments(path.join(root, 'changes'));
  if (!tags) { try { tags = git(root, 'tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean); } catch { tags = []; } }
  const since = tags.map(t => t.replace(/^v/, '')).filter(t => /^\d+\.\d+\.\d+$/.test(t)).sort(compareVersions).pop() || null;
  const issues = [...new Set(files.map(f => parseInt(f.name, 10)).filter(Boolean))];
  const labels = {};
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN}` };
  // (GitHub's API: the address a workflow gives in GITHUB_API_URL, as GitHub Enterprise and the tests do)
  const api = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  if (env.GITHUB_TOKEN) await Promise.all(issues.map(async n => {
    try {
      const r = await fetch(`${api}/repos/${REPOSITORY}/issues/${n}`, { headers, signal: AbortSignal.timeout(15000) });
      if (r.ok) labels[n] = ((await r.json()).labels || []).map(l => (typeof l === 'string' ? l : l.name));
    } catch { /* offline: the change is 'other' */ }
  }));
  return { since, changes: buildChanges(files, labels) };
}
