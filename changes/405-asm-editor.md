In detail:

- The ASM chart editor's code split (#405): its model operations (`web/js/asm-ops.js`), its view
  (`web/js/asm-view.js`), Arrange (`web/js/asm-layout.js`) and its pointer and keys (`web/js/asm-pointer.js`), out of
  `mountAsmEditor` (764 → 292 lines); no change in behaviour.
