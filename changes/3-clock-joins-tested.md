In detail:

- **Device measurements, the clock joins tested (#3):** `clocktests.mjs` tests a clock wire's join by removal on
  ISE's own clock nets (kept to the spine and the GCLKH rows, the PIP into the candidate left out: an island when the
  wire is driven through it), with controls; sparser clock observations (`gen-obsclk.mjs` p). 8592 tests in 1163 small
  designs, every verdict agreeing with the shipped graph: 4999 of the 5973 ambiguous clock wires settled.
