In detail:

- **A pull request's UI tests in every part (#1032):** `scripts/related-tests.mjs --shard i/n` balances the
  related UI tests over the parts by their measured times too (the heaviest with the lightest part of the unit
  tests), instead of all of them in part 1, which passed its 45 minutes on a change of an example.
