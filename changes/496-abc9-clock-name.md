In short:

- **The timing report names the clock again:** a design whose synthesis keeps ABC9's mapping (effort High; the
  blinky example) had its clock called `$abc$24199$aiger$o11` in the timing report; it is the clock's net again
  (`$iopadmap$clk`), as with the other mappings.

In detail:

- **ABC9 keeps the clock nets' names (#496):** ABC9 reintegrates every net a clock pin reads as an alias of its
  own, whose name synth_xilinx's clean kept instead of the net's. `abc9RemapCommands` now marks the nets on the
  cells' clock pins (C, CLK, CLKA, CLKB, WCLK, CLKIN) keep before the mapping and unmarks them after it
  (`ABC9_KEEP_CLOCKS`, `ABC9_UNKEEP_CLOCKS`). The seven examples keep the same netlists (blinky's differs only in
  the clock's name); ABC9's candidate netlist of a design may differ by a few LUTs (traffic 115 to 112, pong 299
  to 301), none of the examples' choices changed. The nine corpus designs that keep ABC9's netlist pass as
  before; nandland-spi-vhdl is smaller and faster (33 to 31 slices, 63 to 59 LUTs, 5.64 to 5.36 ns,
  `test/designs-corpus/expected.json`). Test: `test/open-flow-core.test.js` (blinky's clock line and
  the report's clock, which failed on the old code).
