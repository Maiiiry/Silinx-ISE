In detail:

- **Device measurements, the spine-fed clock wires, the edge tiles and the corners (#3):** clock tests against the spine
  with a baseline for each net and candidate (`clocktests.mjs SPINE`, `NEAR`, `SKIP`), and the edge tiles' joins as
  rules and ambiguous candidates (`edgejoins.mjs`) for the join tests: 9097 tests, every verdict agreeing with the
  shipped graph; 5734 of the 5973 ambiguous clock wires settled, 1499 of the 1626 edge wires seen with a known join.
