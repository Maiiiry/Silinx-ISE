In short:

- **Optimization Effort Normal no larger on mid-depth designs:** a design limited by its logic depth keeps the
  mappings for speed at Normal only when they make it a quarter faster at least, and a design of more than 1500 LUTs
  no longer tries them. ITC'99 b14, b20 and b21 get back their 8 to 11 % fewer slices; the EPFL adder, max and
  priority keep their 3 to 6 times the speed; the synthesis of the large deep designs is 2 to 4 times shorter (EPFL
  voter 68 s to 22).

In detail:

- **DEEP_RULE: 1500 LUTs at most, a quarter faster (#611):** the weekly comparison found ITC'99 b14 / b20 / b21 9 to
  12 % larger at Normal since 15.11.1 and the corpus's synthesis 44 % longer: at 23 levels they took High's mappings
  (#468) for 0 to 15 % of the estimated critical path. Depth does not tell them from the designs the rule was made for
  (a priority encoder of 20 levels is 2.7 times faster with the mappings); size does (the deep designs that gain
  nothing are of 2000 to 3300 LUTs, those that gain several times of 1100 at most). DEEP_RULE is now `{ levels: 16,
  maxLuts: 1500, gain: 0.25 }`: a smaller deep design's mappings are kept when a quarter faster than Normal's own
  netlist, synthesized too (`r.depth.normal`, `r.depth.high`); the console says when they are not ("not a quarter
  faster … the one mapping kept"). Measured at Normal: b14 707 to 648 slices (13.6 s instead of 10.3), b20 1452 to
  1338 (22.1 to 5.2 s), b21 1529 to 1366 (19.0 to 5.2 s), b22 17.3 to 8.0 s, voter 67.8 to 22.0 s; EPFL max, priority
  and adder as before (research/synth-quality/README.md, "Deep designs of 1500 LUTs at most"). `synthesizeOpen`'s
  `deepRule` and the flow's `spec.deepRule` (for tests). Tests: `test/synth-open.test.js` (deepDesign at 1500 LUTs;
  the mappings kept a quarter faster, dropped when not, Normal's own netlist then; not tried above maxLuts),
  `test/open-flow-core.test.js` (the console's line when they are dropped).
