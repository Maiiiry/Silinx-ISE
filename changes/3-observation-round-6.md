In detail:

- **Device measurements, round 6 (#3):** the join tests drive every output line of a block RAM (the block-RAM tiles'
  switches from the bit database, `DBPIPS=1`; where each output enters its interconnect tile, from ISE's routes,
  `blockRamOutputJoins`): 1120 new tests, every verdict agreeing with the shipped graph; no block-RAM join is left
  untestable, 1281 of the I/O tiles are.
