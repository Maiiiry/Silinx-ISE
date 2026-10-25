In detail:

- **The measured XC3S250E description: its split and merged nodes, the I/O tiles' names, every PIP asked in its own tile
  (#3):** seven rounds of join tests (157 612 tests, every valid verdict agreeing with the shipped graph) bring the nodes
  split from 46 646 to 12 217 and the merged ones to none; the joins rules decided are tested, no longer taken as seen
  (two were wrong, the merged nodes); the arc probe finds the I/O tiles' `IOIS_X` names and refuses 484 PIPs a tile had only
  by its type: the extra PIPs go from 9732 to 66. `segmentRules` pairs, `edgejoins.mjs` skips the refused joins,
  `gen-obspins2.mjs` designs for the pins still missing (research/s3e-device README section 10).
