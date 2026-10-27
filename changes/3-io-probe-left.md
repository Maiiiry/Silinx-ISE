In detail:

- **Device measurements, the I/O arc probe of the joins left (#3):** `candidates.mjs io obs.json out.json tests.json`
  asks only for the PIPs a round's untestable joins need (into their I/O-tile ends, and into those PIPs' from-wires),
  as the XC3S250E's round 7 did by hand. The XC3S100E's rounds 1-4 (49 122 join tests, all agreeing with the shipped
  graph) leave 1484 joins for it: 6514 candidates of the 126 097. Tests: test/s3e-device.test.js (`leftCandidates`).
