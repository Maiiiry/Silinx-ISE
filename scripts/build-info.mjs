// What the single-file edition says of the commit it was built from (#135): a release's build (the
// commit tagged v<VERSION>) shows the version alone; any other commit (GitHub Pages publishes main
// after every CI run that passed, before the release is tagged) shows "dev:abc1234
// (2026-10-13 11:12)" (the commit and its date, no version), so that the site is not taken for the release. Outside a git checkout (a release's
// source archive): the version alone.
import { execFileSync } from 'node:child_process';

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
