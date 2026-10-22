In detail:

- **core/elab-expr.js split: the calls in core/elab-call.js (#405):** the built-in VHDL subprograms, std.textio's
  procedures, Verilog's system functions and calls, overloads and subprogram binding move to a module of their own;
  elab-expr.js still exports what it did (elab-expr.js 1129 → 719 lines). No change in behaviour: every HDL folder of
  the repository elaborates the same, and the designs that simulate standalone give the same values and messages.
  Tests: `test/elab-call.test.js`.
