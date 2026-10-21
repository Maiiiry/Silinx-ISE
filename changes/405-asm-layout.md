In detail:

- **core/asm-from-hdl.js split: the layout in core/asm-layout.js (#405):** the layout of an ASM chart recovered from HDL
  and the reuse of a previous chart's ids, positions and edge points move to a module of their own; asm-from-hdl.js
  still exports asmLayout and nodeSize. No change in behaviour: every HDL file of the repository and the generated
  code of the charts recover to the same result as before. Tests: `test/asm-layout.test.js`.
