In short:

- **ISE schematic export of a DCM, block RAM, multiplier, DSP or PLL:** the wires from the ISE symbol's pins to the
  rest of the drawing no longer run over one another (no more "net … overlaps with net …" warnings in ISE), and the
  schematic read back has every net name on its wire.

In detail:

- **The wires from an ISE library pin to the Silinx pin routed (#1798):** where a library symbol's pins are not where
  the Silinx symbol's are (DCM_SP, the block RAMs, MULT18X18SIO, DSP48A1, PLL_BASE …), the export drew a wire across
  then along from each ISE pin, and those of several pins ran along one another and over other pins (ISE's sch2hdl:
  `DesignEntry:241 net … overlaps with net …`; the import back left net names off their wires). Each such wire is now
  routed on the grid (`core/isesch-route.js`) around the drawing's wires, pins and net names of the other nets and the
  wires routed before it: never along another net's wire, never ending or turning on one, never over another net's
  pin or name. The block is placed where none of its pins lands on another net's wire or point.
