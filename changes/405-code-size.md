In detail:

- **Small modules and functions, a rule of the project (#405):** CLAUDE.md (and its summary in ONBOARDING.md) asks
  for source files under 1000 lines and functions under 300, one module per concern, and says how to split one (the
  way #405 did); `test/code-size.test.js` enforces it, the files and functions over the limit today listed as
  exceptions that only shrink, and a pull request that changes a source runs it (`scripts/related-tests.mjs`).
