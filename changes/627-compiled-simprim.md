In short:

- **The post-translate, post-map and post-place & route models on the Board Emulator:** they ran on the event-driven
  engine, far too slow for the design's own timing, and blinky stood still; they now run on the compiled engine, as
  the post-synthesis model does.

In detail:

- **SIMPRIM primitives on the compiled engine (#627):** the compiled engine had no model of the primitives the
  post-implementation models are made of ("the primitives of a post-implementation netlist cannot be synthesized"),
  so the emulator fell back to the event-driven engine. `core/compiled-prims.js` now has X_LUT1-6, X_FF, X_SFF,
  X_LATCH, X_LATCHE, the buffers and gates, as `core/unisim.js` computes them, and `simprimCell` writes those with
  a UNISIM twin as it (X_RAMB16_S*, X_MULT18X18SIO, X_SRL16E, X_SRLC16E, X_RAMSn / X_RAMDn as RAMnX1S / RAMnX1D,
  X_DCM_SP, X_DCM: their models, a block RAM's contents, a DCM's schedule), the generics that place or time a
  primitive left out (`toVerilog`'s option `simprim`). Not X_OBUFT, X_TRI and the pulls. Tests:
  `test/compiled-sim.test.js` (every logic cell, the SRL16s and distributed RAMs, VHDL and Verilog, against the
  event-driven simulator; X_OBUFT not compiled, with the reason), `test/sim-model-lib.mjs` and `test/timesim-lib.mjs`
  (every example's post-translate, post-map and post-place & route model, cycle by cycle),
  `test/ui/open-toolchain.test.js` (blinky's post-translate model compiled, its LEDs moving).
