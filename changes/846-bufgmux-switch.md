In short:

- **Clock switching:** a design that chooses between two clocks with a BUFGMUX (the schematic library's Device
  Primitives, or instantiated in VHDL / Verilog) builds with the Silinx toolchain on the Spartan-3E.

In detail:

- **BUFGMUX in the Silinx toolchain (#846):** the packer makes a BUFGMUX a global buffer with I0, I1 and S, as ISE's map
  writes it (I1_USED, its select not inverted); a clock switch's input from the BUFG Yosys put on that clock is taken
  from the BUFG's input (the clock into the switch on its own line), the BUFG dropped when nothing else uses it; a
  BUFGMUX whose select is a constant is a BUFG of the input it selects. The placer keeps a switch off the other
  buffer of its pair unless that buffer's input is the switch's I1 (the two share their input lines). The timing
  checks apply the PERIOD of the switch's I1 clock to it too (before: "no clock of the design comes from this port").
  A new open-flow fixture, feat_bufgmux.
