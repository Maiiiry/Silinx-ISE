In short:

- **Silinx C: the state machine as an ASM chart:** a sequential C module's Design row has an `[ASM]` badge (and its
  Processes View State Machine (ASM)): the machine the C was made into, read-only, its states with the C's statements,
  its decisions, the block protocol's IDLE and DONE.

In detail:

- **The ASM chart of a C module (#1575):** core/c-asm.js (the chart from core/c-fsmd.js's blocks: a state each, the
  statements its register transfers, the ifs decision boxes, a return / break / continue its jump, a memory's accesses;
  laid out by core/asm-layout.js), core/c-print.js (C written back from its tree), web/js/asm-editor.js and
  asm-pointer.js (a read-only chart: moved about and zoomed, nothing edited), web/js/c-source.js and design.js (the
  badge, the process, the document), core/view-hdl.js (whether a C module is sequential). Tests: test/c-asm.test.js,
  test/ui/c-asm.test.js (both interfaces, Portuguese).
