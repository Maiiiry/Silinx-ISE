In detail:

- **Research: where the speed against ISE is lost, design by design (#656):** a section of
  research/synth-quality/README.md, from the weekly comparison's breakdown of the critical paths (#646): for each
  design slower than ISE at Normal and at High, its logic (levels, LUT, carry and flip-flop delay) and its routing
  against ISE's, and the causes ranked by the speed each could win: the critical path's routing first (#651), then a
  LUT level more on short control paths (#652), the clock enable at the end of the path (#653), the EPFL
  multiplier's depth (#654) and the adder's carry chain (#655).
