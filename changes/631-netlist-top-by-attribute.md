In detail:

- **The netlist's top selected by its attribute (#631):** since #86 each Yosys run writes its top module alone
  (`select -module <top>; write_json -selected`), which left two kinds of top out of the netlist ("netlist: no
  module …" in the Nightly's Yosys test designs): a top with no logic left, which read_verilog marks a black box
  and write_json -selected skips (ifdef_1, specify.v, f6_adder…), and an escaped identifier such as `\1dff`, which
  select -module does not take. The runs now clear the top's black-box mark and select it by its `top` attribute
  (`TOP_ONLY` in core/synth-open.js, in every run's outputs and the coarse run of the carry chains); the netlists
  of the examples and the EPFL adder are the same as before. Test: `test/synth-open.test.js` (an empty top and
  `\1dff`, at Normal and High).
