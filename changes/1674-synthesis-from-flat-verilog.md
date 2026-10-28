In detail:

- **Synthesis from flat Verilog (#1674):** step 3 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The open synthesis is split in two: the HDL front end's part, core/synth-front.js
  `synthesisInput(design)` (the elaborated design as one flat Verilog module, its top, the front end's warnings, the
  shift-register arrays and the gate count), and the toolchain's, core/synth-open.js `synthesizeVerilog(input)`,
  which synthesizes a flat Verilog module with Yosys, the hints optional. `synthesizeOpen(design)` is the two in a
  row and core/synth-open.js still exports it, so its importers are unchanged. The toolchain no longer imports
  core/synth-verilog.js (test/toolchain-boundary.test.js). Tests: test/synth-front.test.js (the input against
  toVerilog and the gate count, synthesizeOpen against synthesizeVerilog on blinky, a hand-written counter
  synthesized from its Verilog alone); the seven examples at both efforts give the same netlists, warnings and logs
  as before. No behaviour change.
