In short:

- **Silinx toolchain, synthesis at effort Normal:** the mapping with the wider functions (two LUTs into an F5
  multiplexer for a 4:1 multiplexer) is tried at Normal too, and kept when better: the EPFL barrel shifter takes as
  many LUTs as with XST at the default effort (941 instead of 1199; XST 939), 471 slices instead of 600, and is 15 %
  faster.

In detail:

- **The wider mapping at effort Normal (#54):** a design that gets none of High's mappings is also mapped with the
  wider functions (`LUT4_COSTS`, the 6-input functions split by `LUT6_MAP`), from the netlist before the LUT mapping,
  and that netlist is kept when better by `DEPTH_RULE` than the one chosen of the others (the critical path's remaps
  included: measured before them, it kept out ITC'99 b08's faster netlist, 11 % slower). On the design corpus at
  Normal 8 designs of 64 change, routed (seeds 1 to 3): EPFL bar 1199 → 941 LUTs, 600 → 471 slices, 10.3 → 8.8 ns;
  ITC'99 b01 20 % faster; IWLS'05 simple_spi 9 % faster for 7 % more slices; verilog-uart 9 % more slices, as fast;
  the 7 timed ones 0.92 times the LUTs, 0.95 times the slices and 0.92 times the period; none slower. The examples
  unchanged. One more Yosys run per design (the corpus's synthesis at Normal 17 % longer, one Yosys at a time);
  `wide: false` leaves it out.
