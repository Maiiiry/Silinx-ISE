In detail:

- **core/asm-from-hdl.js split: the decision trees, the comparison and the text candidates (#405):** an ASM chart
  made from HDL's per-state decision trees (asm-trees.js), the charts' structural comparison (asm-same.js) and
  asmFromHdl's text candidates (asm-candidates.js) move to modules of their own (asm-from-hdl.js 1385 → 727 lines,
  asmFromHdl 326 → 273). No change in behaviour: every HDL file of the repository and the HDL of the 454 charts the
  ASM tests make, read back with and without the chart as `previous` (1839 results), give the same charts as
  before. Tests: `test/asm-from-hdl-parts.test.js`.
