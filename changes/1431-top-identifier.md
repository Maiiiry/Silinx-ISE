In detail:

- **A project's top module name checked as an identifier (#1431):** `top` and `simTop` must be HDL identifiers
  wherever a project is written (`PUT /api/projects/:p`, the .xise and zip imports, the .xise sync: 400 otherwise;
  an empty name, no top yet, stays valid), and the routes that name the build's files from the top (`bitinfo`,
  `fpga-view`, `reports`, `program`, `prom`, `implement`) refuse one that is not (`server/ident.js`, shared with the
  ISE build's own check), so a `top` holding `..` can no longer name a `.bit` outside the project.
