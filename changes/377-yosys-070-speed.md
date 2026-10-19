In detail:

- **Yosys 0.70's speed, measured again (#377):** with the synthesis and back end of 2026-10-19, the 19 timed designs
  of the Yosys 0.70 update's comparison are as fast with 0.70 as with 0.68 (critical path 0.995, slices 0.974, at
  effort High; 0.926 at Normal), the 3 % of #368 won back by the changes since (the ABC9 candidate, the slices in
  the choice of the mapping, the carry chains and the deep designs at Normal). Pong stays 10 % slower at High
  (11.26 → 12.37 ns): ABC 0.70's own mapping, which none of the open synthesis's mappings brings back
  (research/synth-quality/README.md, "Yosys 0.70 against 0.68, with today's synthesis"). No code changed.
