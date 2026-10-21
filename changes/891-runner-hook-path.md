In detail:

- **The ISE runner's hook in a folder without spaces (#891):** the GitHub runner runs its job-started hook
  without quoting its path, so `…/Library/Application Support/Silinx-ISE-runner/job-started.sh` split at the
  space and every job on the ISE runner failed before its first step. `scripts/ise-runner/install.sh` now copies
  the scripts to `/Library/Silinx-ISE-runner` (`--system`) or `~/Library/Silinx-ISE-runner`, and removes the old
  folder. Tests: `test/ise-runner.test.js` (the hook's path in `.env` has no whitespace; the old folder removed).
