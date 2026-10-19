In short:

- **Checking a download:** each release lists its files' SHA-256 checksums (in its notes and in the file
  `SHA256SUMS`) and GitHub's build provenance attestation of each file, so that a zip or `Silinx-ISE.html`
  got from elsewhere (a course page) can be checked against the release; the README and Getting Started say how.

In detail:

- **Release checksums and build provenance (#485):** `scripts/package-release.mjs` writes `SHA256SUMS`
  (`scripts/checksums.mjs`, the format of `sha256sum`) next to the files it packages; the Release workflow
  attests the files it lists with `actions/attest-build-provenance` (pinned by commit; the job gains
  `attestations: write` and `id-token: write`), publishes it among the release's files and puts the sums and
  how to check them at the end of the notes (`scripts/release-notes.mjs --sums`). The development build's
  files get their `SHA256SUMS` too. Tests: the checksums against the standard's test vectors and the system's
  `sha256sum` / `shasum`, the release zip's sum, the notes, and the workflow's steps and permissions.
