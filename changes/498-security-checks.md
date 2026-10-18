In short:

- **A security policy and the platform's checks:** `SECURITY.md` says how to report a vulnerability privately,
  what is supported and in scope; CodeQL, a dependency review and a scan of the whole history for private data
  run on GitHub, next to secret scanning and push protection.

In detail:

- **The security checks (#498):** `SECURITY.md` (private reporting through GitHub's advisories, answered within
  two weeks and fixed in the next release; the latest release and main supported; the server, browser editions,
  toolchain, workflows, scripts and launchers in scope, Xilinx ISE and an exposed server out; what the project
  does), pointed to from README.md and CONTRIBUTING.md. `.github/workflows/codeql.yml`: CodeQL for JavaScript
  (`build-mode: none`, node_modules and research/ left out) on pull requests, pushes to main and weekly, a
  workflow of its own with a read-only token, `security-events: write` on its job only. In `ci.yml`, two jobs
  that `ci-ok` needs: `private-data-history` (a push to main: `scripts/check-private-data.mjs --history`, whose
  `ALLOW` list now clears XPower's section numbers 3.3.1.x read as addresses in an old `scripts/measure-power.mjs`
  and two commit messages) and `dependency-review` (a pull request: `actions/dependency-review-action`, red from
  moderate severity, no licence list, no comment). The repository's settings, secret scanning, push protection,
  Dependabot alerts and security updates, private vulnerability reporting, were turned on by hand. CLAUDE.md and
  ONBOARDING.md say so. Tests: `test/ci-changes.test.js` (the job list, the two jobs' events and `ci-ok`'s needs;
  `codeql.yml`'s triggers, permissions, pinned actions and exclusions; `test/workflows.test.js` admits GitHub's
  own `github/codeql-action`), `test/private-data.test.js` (the allow-list clears the history's matches and the
  same text elsewhere is still reported), `test/docs.test.js` (the links).
