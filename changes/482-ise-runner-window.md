In detail:

- **The ISE runner reached only by the ISE and Quality workflows (#482):** the repository is public, so a
  pull request from a fork could bring a workflow of its own with `runs-on: self-hosted`, one approving
  click away from the maintainer's machine. `scripts/ise-runner/job-started.sh`, the runner's job-started
  hook, fails every job before its first step unless it is `ise.yml` or `quality.yml` of main, on schedule
  or by hand (`GITHUB_WORKFLOW_REF`, `GITHUB_EVENT_NAME`, `GITHUB_REF`, set by the runner). A launchd agent
  (`window.mjs`, every 15 minutes) keeps the runner on line only in the two workflows' window: from 21:15
  every evening until the runner is idle, nothing of theirs is queued and the evening's runs have finished
  (Quality's too on Saturdays), at most 18 hours; `window.sh open` puts it on line for a run by hand. The
  window alone would not protect, as GitHub keeps a job queued for a runner that is off: the hook does.
  `install.sh` sets both up on the machine, out of the repository's checkout. Tests:
  `test/ise-runner.test.js` (the hook's allowed and refused jobs, the window's decisions and its reads of
  GitHub's API, and that no workflow but those two reaches the runner, `runs-on` checked in every job).
