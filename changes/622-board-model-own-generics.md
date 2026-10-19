In short:

- **The emulated simulation models run at the board's speed:** Emulate Post-Synthesis Model (and the post-translate,
  post-map and post-place & route ones) ran the model made with the test bench's generics, blinky's divider of 2
  instead of 625 000, so at Real time its LEDs changed millions of times a second and nothing could be seen. The
  board now runs the design with its own generics.

In detail:

- **The board's model, with the design's own generics (#622):** a simulation model is synthesized with the generics
  the test bench gives the top (#120), so that the test bench tests what it simulates; the Board Emulator ran that
  same file. When a model has a test bench's generics, the flow now also writes the design's own model beside it,
  `<top>_<suffix>_board.vhd` / `.v`, made of this run's implementation or the last run's (its synthesis in
  build/open, netlist, packing and routing; the model's step alone and no synthesis yet: the design synthesized
  with its own generics too), listed in the report as `simModels.<step>.board`; the emulator runs it and says so in
  the console, the simulation keeps the test bench's. Tests: `test/sim-model.test.js` and
  `test/sim-model-impl.test.js` (the files, the report, the exact log; the board's models simulated with the test
  bench without its generics), `test/timesim-lib.mjs` (every example's post-place & route board model),
  `test/ui/open-toolchain.test.js` (blinky's emulated LEDs on or off, not half lit).
