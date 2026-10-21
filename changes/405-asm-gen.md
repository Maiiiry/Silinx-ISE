In detail:

- **core/asm.js split: the generators in core/asm-gen.js (#405):** the VHDL and Verilog generators of an ASM chart move
  to a module of their own; asm.js still exports them. No change in behaviour: the same code generated for every
  chart, language and encoding. Tests: `test/asm-gen.test.js`, the generated code compiled and elaborated with no
  diagnostics and recovered to the same chart.
