In short:

- **Optimization Effort High, state machines:** with the Silinx toolchain, a state machine of 8 states or more is
  also tried one-hot, as XST does, and kept when the circuit is better (ITC'99 b10 19 % fewer slices and 9 %
  faster). The examples are unchanged.

In detail:

- **State machines one-hot at Optimization Effort High (#539):** Yosys's `fsm` refuses every register with an
  initial value, which Silinx's front end gives each one. At High a quiet first run finds the machines of 8 states or
  more kept out for that alone; a design with some is synthesized once more with them extracted and re-encoded
  one-hot, the power-up state kept (the init value written back in the new code), and that netlist is kept when
  better by the same rule as the other mappings (`core/synth-fsm.js`, from #438's research). Smaller machines,
  Normal, and machines whose power-up state cannot be kept are left as they are; a failed run is said and the usual
  netlist kept. On the design corpus one-hot is kept on 4 of the 8 designs concerned (b10 −19 % slices / −9 % period,
  b17 −8 % / −4 %, b11 −3 % / −1 %, b15 +3 % / −4 %), 0.96 of their slices and 0.98 of their period; the examples
  have no such machine (research/synth-quality/README.md, "One-hot at Optimization Effort High"). Tests:
  `test/synth-fsm.test.js`.
