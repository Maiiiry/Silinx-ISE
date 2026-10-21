In detail:

- **A negation that wraps, read wider, synthesized right (#743):** Yosys 0.70's alumacc, after wreduce, merged a `$neg`
  narrower than the sum reading it into that sum at its full width, so -(-16) at 5 bits, read at 16, came out
  unwrapped (the Nightly's VlogHammer wideexpr_24040: `-($signed(-x))` gave 0xfff0 instead of 0x0010, at both
  efforts). core/synth-verilog.js writes `-x` as `0 - x`, a subtraction, which Yosys keeps at its width; the examples'
  netlists are unchanged, and the corpus's nine designs with a negation (ITC'99) within ±1.5 % in LUTs (b04 25 %
  faster). Test: test/synth-negation.test.js (the value by hand, the simulator, the netlist at Normal and High).
