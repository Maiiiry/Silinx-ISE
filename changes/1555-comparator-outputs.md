In short:

- **Schematic: a comparator with several outputs:** COMP's comparisons are tick boxes, EQ NE LT LE GT GE; each one
  ticked is an output of its own, so one comparator gives A = B, A < B and A > B at once.

In detail:

- **COMP: several comparisons at once (#1555):** the Operation selection box of the schematic comparator is now
  Comparisons, six tick boxes (`web/js/sch-compare.js`). One ticked: the symbol as before, its output O (a comparator
  saved before opens with that box ticked, its pin and wiring unchanged); several: a box with an output each, named EQ,
  NE, LT, LE, GT, GE in that order (`compareOps`, `comparePin` in `core/schdoc-symbols.js`). At least one stays
  ticked: unticking the last one is refused. A tick re-pins the symbol (`repinSymbol`, `core/schdoc-repin.js`, with
  Update Symbol's pin-following moved there): the wires, I/O markers and net names of the pins that stay follow them;
  unticking a connected output asks first, then drops its wires; one undo step a tick. Signed, Width and Pins per bit
  apply to every output; the generated VHDL and Verilog, the simulation, Try it and Symbol Info (its own tick boxes,
  its texts and pin table) follow, and the ISE export names the symbol after its comparisons (`xl_cmp4_lt_gt`), read
  back on import. Several COMPs selected together do not list Comparisons among their common properties.
