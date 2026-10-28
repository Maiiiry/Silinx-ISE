In detail:

- **The critical-LUT resynthesis stage in a module of its own (#1787):** the last depth candidate of withDepth
  (core/synth-open-depth.js), the critical LUTs made one level shallower (#652), moved as it was into
  core/synth-open-resynth.js (`resynthStage`), called where the code was, so that a new candidate (#1360) does not take
  `mountDepth` past the 300 lines of test/code-size.test.js (#405). No change of behaviour. Its own test:
  test/synth-open-resynth.test.js (spi-fpga-slave's enable through Yosys, kept, the same function on every input; left
  out without speed or resynth or past SPEED_RULE.maxLuts; a run that fails, its warning).
