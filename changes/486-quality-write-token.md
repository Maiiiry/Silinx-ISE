In detail:

- **Quality workflow, the writing token kept off the self-hosted runner (#486):** `quality.yml` has a read-only
  token at the top and on the self-hosted comparison job; its one writing job (`contents: write`) runs on
  GitHub's runner and pushes the results to the branch `quality-results` only. It now checks the artifact it
  receives from the maintainer's machine before committing it: the two expected files, regular files (no
  symbolic links) under 2 MB, the comparison valid JSON. `test/workflows-permissions.test.js` lists
  `quality.yml` among the read-only workflows and asserts which of its jobs write (the push, and the failure
  report's issue) and the check before the commit.
