In short:

- **Silinx toolchain, synthesis at effort High:** a 4:1 multiplexer of the mapping with the wider functions is two
  LUTs and an F5 multiplexer, as XST builds it, instead of four LUTs and three F-multiplexers: the EPFL barrel
  shifter takes as many LUTs as with XST (941 instead of 1201; XST 939) and fewer slices (471; XST 534), and is faster.

In detail:

- **A 6-input function split on the right input (#54):** the remaps with the wider functions (`LUT4_COSTS`) split a
  6-input function on the input whose two cofactors each depend on 4 inputs at most, when there is one, into two
  LUT4s and a MUXF5 (`LUT6_MAP`, before Yosys's `lut_map.v`, which splits on the last two inputs whatever the
  function: four LUT4s, two MUXF5 and a MUXF6). On the design corpus at High: EPFL bar 1201 → 941 LUTs, 601 → 471
  slices, 10.6 → 9.4 ns; ITC'99 b13, b14, b20 and b21 5 to 7 % smaller; ITC'99 b11 and b15 7 % larger (10 % and 1 %
  faster); the 67 designs 0.5 % fewer LUTs, 0.7 % fewer slices, 0.9 % faster; the examples unchanged. Every netlist
  equal to the RTL. (Merged once as #634 and reverted, #648: it made femtorv32-quark 9 % larger.)
- **The choice of the mapping (#54):** a faster netlist's slices may grow no more in proportion than it is faster
  (femtorv32-quark keeps its netlist), and one faster with no more slices may have up to 20 % more LUTs (10 %
  before: verilog-uart keeps its faster ABC9 netlist).
