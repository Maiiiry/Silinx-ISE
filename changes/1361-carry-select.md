In short:

- **Faster wide adders from the Silinx synthesis:** an adder, subtractor or comparator of 64 bits or more is tried as
  carry-select segments, and kept when faster: the EPFL benchmark's 128-bit adder 24 % faster.

In detail:

- **Carry-select adders (#1361):** a carry chain of `CSEL_RULE.chain` (64) stages or more is one ripple through every
  bit: the EPFL adder's 128 bits took 10.6 ns of logic where ISE's XST has 8 LUT levels. A design whose netlist has such
  a chain (`longestCarryChain`) is now synthesized once more with its `$alu` cells that wide as segments of
  `CSEL_RULE.segment` (32) bits, each but the first computed for a carry in of 0 and of 1 (two chains) and chosen by the
  carry out of the segment below (`CSEL_MAP`, a techmap given to Yosys before synth_xilinx's fine step, in
  `core/synth-open.js`); kept when 3 % faster by the estimate with no more slices in proportion (`r.depth.csel`), at both
  efforts, for designs of 5000 LUTs at most. The EPFL adder: 12.7 → 9.6 ns by Silinx's static timing, 171 → 270 LUTs,
  194 → 232 slices (ISE's 446); segments of 16 bits were slower once routed. No other design of the corpus or the examples
  has a chain that long; their netlists are the same.
