In detail:

- **Device measurements, the PIPs of each tile asked (#3):** `candidates.mjs rest measured.json.gz out.json obs.json
  probe.json,…` writes the arc probe's candidates of section 10, which the XC3S250E's were made by hand: every PIP of a
  measured description's non-CLB tiles that neither ISE's routes nor a probe showed in that tile, and an I/O tile's site
  outputs in its own names (`IOIS_X0`). For the XC3S100E, 169 493 candidates. Tests: test/s3e-device.test.js
  (`restCandidates`).
