In short:

- **Silinx toolchain, fewer slices and shorter critical paths:** a design with an active-low reset or clock
  enable no longer spends a LUT per flip-flop on its inverter (iwls05-i2c 195 → 136 slices, t80 1296 → 1146),
  and the LUTs of a critical path are packed together (t80 about 4 % faster).

In detail:

- **Pack: an inverter on a flip-flop's set / reset or clock enable is the slice's SRINV / CEINV (#527):**
  Yosys's extractinv writes one INV per flip-flop, which made a LUT of each; those pins take the inverter's
  input with IS_<pin>_INVERTED toggled, as the clock pins already did (#80), and an inverter that also drives
  logic keeps only those loads.
- **Pack: slices filled by timing (#528):** every connection's criticality is estimated before placement (the
  model of synth-open's criticalDelay); critical units seed first, the units of a critical connection share a
  slice, and a LUT on a critical path no longer fills a slice of unrelated logic. Kept when it costs at most
  2 % more slices (and one) than the packing by nets. ISE's trce on Silinx's routing: verilog-uart 11.70 →
  10.61 ns, t80 22.30 → 21.93 ns.
