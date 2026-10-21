In short:

- **Faster small control paths with the Silinx toolchain:** after the LUT mapping, the synthesis makes the LUTs at the
  end of the critical path one level shallower where it can, without making shared logic again: spi-fpga-slave's shift
  register 18 % faster, the clock example 15 %, iwls05-sasc 11 %; 1.2 to 1.4 % shorter critical paths on average, with
  as many slices.

In detail:

- **The critical LUTs made one level shallower, their fan-out kept (#652):** a last candidate of the synthesis
  (`core/lut-resynth.js`, at both efforts, designs of 1500 LUTs at most), on the netlist chosen of all the others and
  kept by `DEPTH_RULE`: each LUT that ends a critical path, at level L, is made again from its cone's signals of level
  L-2 at most, as one LUT of up to 4 of them or as h(g(A), S) (a decomposition of its function with a new LUT g of
  signals of level L-3 at most), found by truth tables, its output (and so its fan-out) kept; the LUTs it read stay
  where something else reads them, and a LUT that the netlist already has (the same function of the same signals) is
  read instead of a new one. Round after round while every end of the critical path can be made shallower. On
  spi-fpga-slave the shift register's enable is 2 levels instead of 3 with its shared `load_data_en` kept (21 LUTs → 23,
  14 slices; ABC's speedup found the 2 levels with 33 LUTs and 19 slices, refused). Recorded in the synthesis's
  `depth.resynth` (`resynth: false` leaves it out). Measured with Silinx's static timing on the corpus's 53 designs of
  1500 LUTs at most and the 7 examples, routed: at Normal 14 change, 5.8 % shorter on average (1.4 % over the 60), at
  High 16 change, 4.3 % (1.2 %); slices +5 at each effort (of 10935); at placer seeds 1 to 3 the changed ones 4.5 %
  shorter (spi-fpga-slave −18 %, the clock example −15 %, itc99-b13 at High −14 %, verilog-uart at Normal −12 %),
  three slower (verilog-uart at High +5 %, vtr-ch-intrinsics and iwls05-sasc at High +3 %: faster by the estimate,
  slower routed). By ISE's trce on the same routed designs: 4.55 % shorter over the 20 changed builds (spi-fpga-slave
  5.76 → 4.95 ns, ISE's own flow 4.94), every bitstream byte-identical to ISE's bitgen with a clean DRC.
  research/synth-quality/README.md, "The critical LUTs made shallower".
