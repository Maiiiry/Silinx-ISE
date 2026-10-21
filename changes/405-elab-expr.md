In detail:

- **core/elaborate.js split: the expressions in core/elab-expr.js (#405):** the elaboration of expressions (names and
  hierarchical names, operators typed and sized for Verilog and VHDL, slices, fields, conversions, the built-in
  subprograms, function calls and their overloads, std.textio) moves to a module of its own. No change in behaviour:
  every design of the repository elaborates and simulates as before. Tests: `test/elab-expr.test.js`.
