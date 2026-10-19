In short:

- **Synthesis two to three times faster:** the open synthesis no longer writes Yosys's whole Xilinx cell library
  into every netlist it tries, which took most of its time; the netlists it makes are the same. The examples
  synthesize in 2 to 4 s instead of 7 to 12 at Optimization Effort High, and the netlist file is 15 to 100 times
  smaller.

In detail:

- **The netlist's JSON has the top module alone (#86):** synth_xilinx reads Yosys's Xilinx cell library (about 430
  black boxes of every family), and `write_json` wrote them all into each Yosys run's netlist: 9 to 14 MB whatever
  the design (blinky 13.4 MB, its own module 0.27 MB), about 0.9 s of every run, whose LUT mapping takes 0.15 s.
  Each run now writes the top module alone (`select -module <top>; write_json -selected`); every reader of the
  netlist takes its top module. The depth-oriented mapping, found 2.5 to 3.7 times as long as the first run, now
  costs less than it: most of what every run spent was this writing. Measured on the examples, 18 designs of the
  corpus and the deep EPFL / ITC'99 ones: the same netlists, choices, statistics and warnings; the synthesis 0.32
  times as long on the examples at High, 0.42 on the corpus designs, 0.46 at Normal, 0.52 with the application's 4
  Yosys workers (research/synth-quality/README.md, "Synthesis time: the netlist's JSON"). Test:
  `test/synth-open.test.js` (the JSON's one module at both efforts, which failed on the old code).
