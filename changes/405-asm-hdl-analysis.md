In detail:

- **core/asm-hdl-analysis.js split: analyzeModule's states, synchronisers and logic bodies (#405):** the states
  of the state register (asm-hdl-states.js), the input synchronisers (asm-hdl-sync.js) and the logic bodies with
  the every-cycle blocks (asm-hdl-bodies.js) move to modules of their own, called where they were (analyzeModule
  459 → 292 lines). No change in behaviour: every HDL file of the repository and the HDL of the 454 charts the ASM
  tests make (1840 results) give the same charts as before. Tests: `test/asm-hdl-parts.test.js`.
