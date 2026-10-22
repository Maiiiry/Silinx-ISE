In detail:

- **web/js/wizards.js split: the New Source wizard in web/js/new-source.js (#405):** newSourceWizard, its source
  types and the test bench's port reading move as they were to a module of their own; wizards.js still exports
  newSourceWizard (wizards.js 1209 → 938 lines, off the list of files over the limit). No change in behaviour.
  Tests: `test/new-source-module.test.js`.
