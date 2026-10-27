In detail:

- **Device measurements, the recipe for the other dies, part 2 (#3):** `measure.mjs tiles` runs the tile probe
  (candidates.mjs tiles, probe-run.mjs on ISE) and writes the switch-box tiles, seen in ISE's routes or found by the
  probe, and the CLBs among them (switch-tiles.txt, clb-tiles.txt), the lists the later stages read. Tests:
  test/s3e-device.test.js (`tileLists` rebuilds the XC3S250E's committed list from overlapping halves, in its order).
