In short:

- **Open synthesis:** a large round-robin arbiter written as gates takes about 8 % fewer LUTs and slices at High; the T80
  routes about 7 % faster at High.

In detail:

- **The fourth balanced candidate: its area mapping made four more times (#370):** the mapping balanced once more onto
  LUT4s alone (`DEPTH_ABC2_LUT4`) ends with four more rounds of ABC's area mapping (choices, mapping, `mfs2 -M 5000`),
  each sharing more of a round-robin arbiter's terms at the same depth: the EPFL arbiter in the corpus's I/O wrapper
  1537 → 1410 LUTs and 769 → 705 slices at High (8 levels, 9.92 ns estimated both); a 32-request arbiter written as
  gates 320 → 248 LUTs. On the design corpus the T80 at High takes the candidate's new netlist inside its
  distributed-RAM mapping (1782 → 1720 LUTs, 992 → 961 slices, routed 7 % faster); the other designs and the examples
  keep their netlists and warnings (the stopwatch example one LUT fewer). The candidate's remap takes about 1.6 times
  as long (the arbiter's 10 s → 16 s), beside the other three.
