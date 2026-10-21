In short:

- **Faster state machines written one-hot with the Silinx toolchain:** a state machine of 8 states or more that Yosys
  would leave as written (its states tested on all their bits) is tried one-hot too, at both Optimization Efforts:
  iwls05-i2c's I2C bit controller 33 % faster at Normal and 27 % at High, with 15 % fewer slices.

In detail:

- **The state machines fsm_detect refuses for their users alone, one-hot (#652):** Yosys's fsm_detect turns down a
  state register whose users "don't seem to benefit from recoding" (a heuristic), where XST re-encodes it: iwls05-i2c's
  bit controller, 18 states written one-hot (idle all zeros) and tested on all 17 bits, two LUT levels more than XST's
  netlist on the critical path. The search for state machines (`core/synth-fsm.js`, #539) now reads fsm_detect's
  messages, marks such registers by hand (never one a port reads, nor one refused for another reason), extracts them in
  a quiet run of their own, and tries those of 8 states or more one-hot, their power-up state kept (state 0, the
  flip-flops', when the register has no initial value), kept by `DEPTH_RULE`; at Normal too (one quiet Yosys run more
  beside the usual one), where #539's machines stay High's. The copy of an old state register that `fsm` keeps for a
  reader it cannot take in now gets the old initial value too (it powered up undefined). Measured on the corpus's 53
  designs of 1500 LUTs at most and the 7 examples, routed (Silinx's static timing, seed 1): iwls05-i2c alone changes,
  at Normal 253 → 211 LUTs, 137 → 116 slices, 8.66 → 5.82 ns (ISE's flow 5.91 by trce), at High 260 → 205 LUTs,
  141 → 123 slices, 8.68 → 6.32 ns; verilog-i2c-master's 16-state machine is tried and not kept; the other netlists
  are the same. By ISE's trce on the same routings (seeds 1 to 3, both efforts): 29.8 % shorter, Normal 8.33 → 5.71
  ns at seed 1 (ISE's own flow 5.91), every bitstream byte-identical to ISE's bitgen with a clean DRC.
  research/synth-quality/README.md, "State machines fsm_detect refuses for their users".
