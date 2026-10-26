In detail:

- **The ISE image's build scripts and the runner's installer, tidier (#1442):** `docker/ise/build-ise-image.sh`
  (and `.ps1`) stage the installer in a folder made for the run (`mktemp -d`), so the cleanup removes nothing
  that was there before; without `--installer` / `--license` they take the files from `~/Downloads` only (not
  the current folder) and say which they took; their help says the MD5 check is integrity against the
  published sum, not authenticity. `scripts/ise-runner/install.sh` documents `--system` as the mode to use,
  warns in the other mode that the hook and `.env` belong to the user the jobs run as, and says (with
  ONBOARDING.md) to clear the runner user's `silinx-cache` and `_work` folders after a suspicious run.
  `test/ise-image-kit.test.js` (new) and `test/ise-runner.test.js` check them.
