In short:

- **Shorter control paths with the Silinx toolchain:** a critical LUT that one or two LUTs cannot make shallower is now
  rebuilt as a tree of LUTs (by ISE's timing iwls05-sasc 12.7 % faster and a quarter smaller at Optimization Effort High, itc99-b13 9.6 %,
  fpu-adder 7.3 %).

In detail:

- **The critical LUTs made shallower as a tree of LUT4s (#652):** when neither one LUT nor two (h(g(A), S)) can make the
  LUT ending a critical path one level shallower, its cone (up to 12 leaves, the latest LUTs expanded first) is rebuilt
  as a tree of LUT4s by disjoint decompositions, its output and so its fan-out kept (`core/lut-resynth.js`,
  `shallowerTree`); kept by `DEPTH_RULE` as before. On the corpus's 53 designs of 1500 LUTs at most and the 7 examples:
  6 of the 120 builds changed, all faster by Silinx's static timing (iwls05-sasc at High −16.1 %, 66 → 49 slices, its
  FIFOs in distributed RAM; itc99-b13 at High −10.3 %; fpu-adder −3.4 %), the others the same; every changed netlist
  simulates as its design. By ISE's trce on the 6 changed routings: 5.80 % shorter (iwls05-sasc at High −12.7 %,
  itc99-b13 at High −9.6 %, fpu-adder −7.3 %; iwls05-sasc at Normal +4.5 %), every bitstream byte-identical to ISE's
  bitgen with a clean DRC. research/synth-quality/README.md, "A tree of LUT4s where one or two LUTs cannot do it".
