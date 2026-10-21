In detail:

- **core/synth-verilog.js split: toVerilog in parts (#405):** the translator of an elaborated design into Verilog for
  Yosys mounts its values, operators, tables (expressions as tables, ROMs, functions), statements and module from
  modules of their own (core/synth-values.js, synth-operators.js, synth-tables.js, synth-stmts.js, synth-module.js);
  toVerilog 1182 → 176 lines. No change in behaviour: every design of the repository translates to the same text.
  Tests: `test/synth-parts.test.js`.
