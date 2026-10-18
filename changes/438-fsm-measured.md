In detail:

- **State machines extracted and re-encoded: measured, not changed (#438):** Yosys's `fsm` pass never extracts a
  machine from Silinx's netlists, as `fsm_detect` refuses registers with an initial value. `research/synth-quality/fsm.mjs`
  extracts them anyway with their power-up state kept (the init value written back in the new encoding) and measures
  binary and one-hot against today's synthesis on the examples and the design corpus, and `fsm-ise.mjs` adds XST's
  encodings (README, "State machines"). 44 registers in 24 designs are kept out by their init value alone (traffic
  and pong among the examples). One-hot is no better on average (16 % more flip-flops, as many slices, 1.5 % slower),
  Yosys's binary is worse, and keeping the better of one-hot and today's is worth about 3 % of the slices beyond the
  placement's noise. The open synthesis is unchanged. Tests: `test/synth-fsm.test.js`.
