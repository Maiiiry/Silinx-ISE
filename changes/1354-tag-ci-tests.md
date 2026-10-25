In detail:

- **15.14.0's tag CI (#1354):** test/ui/standalone.test.js's own builds without GITHUB_REF (a tag's CI made them the
  release's); test/ui/harness.js imports the app's modules for a hidden menu only where the page loads them (the
  single-file editions have none, and Firefox reported the failed loads as console errors).
