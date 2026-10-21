In detail:

- **core/schdoc.js split: the HDL generation in core/schdoc-hdl.js (#405):** the HDL generated from a schematic moves
  to a module of its own, generateHdl's per-symbol logic to schdoc-hdl-symbol.js, schdoc-hdl-cases.js and
  schdoc-hdl-more.js (generateHdl 759 → 216 lines; schdoc.js 3105 → 2286); schdoc.js still exports generateHdl and
  the rest. No change in behaviour: every schematic of the repository and one of every symbol kind generate the same
  HDL. Tests: `test/schdoc-hdl.test.js`.
