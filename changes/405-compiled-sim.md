In detail:

- **core/compiled-sim.js split: compileNetlist in eight parts (#405):** the compiled simulator's constants and helpers
  move to compiled-helpers.js (CompileError among them), its VGA monitor to compiled-vga.js, and compileNetlist's
  parts to modules of their own: the netlist read (compiled-cells.js), the expressions (compiled-exprs.js), the
  elements (compiled-elements.js), the clocks and DCMs (compiled-clocks.js), the activity (compiled-activity.js), the
  edges and counts (compiled-watch.js), the loop's steps and template (compiled-steps.js), the code
  (compiled-generate.js) (compileNetlist 691 → 103 lines; compiled-sim.js 1209 → 345); compiled-sim.js still exports
  everything it did. No change in behaviour: every netlist of the compiled simulator's tests compiles to the same code,
  with every activity, wide values and a split run(). Tests: `test/compiled-parts.test.js`.
