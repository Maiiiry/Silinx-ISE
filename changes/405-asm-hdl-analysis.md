In detail:

- **core/asm-from-hdl.js split: the module's analysis in core/asm-hdl-analysis.js (#405):** the recovery of an ASM chart
  from HDL reads the generator's header, the clocked process and the module's state register, states, outputs and logic
  in a module of its own, with the small helpers on the parsers' IR in core/asm-hdl-util.js. No change in behaviour:
  the same recovered charts as before. Tests: `test/asm-hdl-analysis.test.js`.
