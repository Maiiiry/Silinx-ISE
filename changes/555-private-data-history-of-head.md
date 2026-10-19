In detail:

- **The private-data history scan reads main's history, not every branch (#555):**
  `scripts/check-private-data.mjs --history` scans the history of HEAD instead of `git log --all`, so an
  open pull request's branch can no longer fail main's CI; the `private-data-history` job now runs on
  pull requests too, on the merge commit's history, so a line added and removed again on a branch is
  found before it reaches main.
- **#545's made-up path in the allow-list (#555):** a made-up home folder in `test/static-editions.test.js`, added and
  removed again on #545's branch, reaches main's history when it merges; the `ALLOW` list names it.
