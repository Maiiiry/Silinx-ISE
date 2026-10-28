In detail:

- **Spartan-6: the LUT and slice databases checked against ISE's examples (#725):** research/s6/check-slice6.mjs
  predicts every slice of the seven examples ISE implemented on the Nexys3 and the Atlys from research/s6/db and
  compares them with ISE's bitstreams, tile by tile: 642 of 650 tiles identical, no unexplained bit in the slices'
  frames once the carry in from the slice below (bit 51) and ISE's route-throughs are modelled; the 8 left are a
  SLICEX's settings in a CLEXM tile, still to measure. Tests: test/s6-check-slice.test.js.
