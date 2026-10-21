In detail:

- **core/schdoc.js split: a schematic made from HDL in core/schdoc-from-hdl.js (#405):** schematicFromHdl and
  modulesFromLibrary move to a module of their own, the placement and routing to schdoc-place.js, and two parts of
  schematicFromHdl to schdoc-source.js (the source text pieces) and schdoc-gates.js (the gate conversion);
  schematicFromHdl 586 → 286 lines, schdoc.js 2286 → 1276; schdoc.js still exports them. No change in behaviour: every
  design of the repository becomes the same schematic. Tests: `test/schdoc-from-hdl.test.js`.
