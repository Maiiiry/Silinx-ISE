In detail:

- **A fourth candidate of the balanced mappings: onto LUT4s alone (#370):** at High (and at Normal for a deep design),
  when the depth-oriented mapping is kept, the mapping balanced once more (`DEPTH_ABC2`) is also made onto LUT4s alone
  (`LUT4_ONLY`), beside the three on the wider functions, and kept by the same rule. A round-robin arbiter's ring-shaped
  priority chains take fewer LUTs and slices so: the EPFL arbiter (in the corpus's I/O wrapper, not in the corpus) 2196
  → 2019 LUTs, 1224 → 1010 slices, routed 1.5 % faster; a 24-request arbiter written as gates 99 → 81 slices, 12 %
  faster by the estimate. On the design corpus it is never kept (the same netlists); the 18 designs that make it
  synthesize 6 % longer (one Yosys at a time; beside the other three with the app's 4 workers).
