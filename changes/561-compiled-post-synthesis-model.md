In short:

- **The Post-Synthesis Model on the Board Emulator's compiled engine:** Emulate Post-Synthesis Model ran the
  netlist on the slow event-driven engine only, so the VGA monitor of the vga example stayed dark ("needs the
  compiled engine"); the compiled engine now runs the model's LUTs, flip-flops and carry chain, and the monitor
  draws its picture.

In detail:

- **The compiled engine's models of a synthesized netlist's primitives (#561):** `core/compiled-prims.js` had
  Verilog models of the buffers, block RAMs, multipliers, SRL16s, distributed RAMs and DCMs, not of the logic a
  Post-Synthesis Simulation Model is made of, so `netlistOf` refused it ("no model of LUT2, LUT4, LUT3, MUXCY,
  XORCY, FDRE") and the emulator fell back to the event-driven engine. Now LUT1-6 (_L, _D) with their INIT, the
  flip-flops FD* and latches LD* (and _1) with their INIT, MUXCY, MUXF5-8, XORCY (_L, _D) and MULT_AND, as
  `core/unisim.js` computes them (FDCP / FDCPE as one asynchronous load, which Yosys makes without a warning);
  the Yosys warnings of the models themselves (their latches) are not the design's and are left out. The model
  runs well below the RTL's speed (vga 8 million cycles a second against 50, pong 1.1 against 24). Tests:
  `test/compiled-sim.test.js` (every primitive, every INIT, in VHDL and in Verilog, against the event-driven
  simulator; a primitive with no model is now PULLUP), `test/sim-model.test.js` (every example's model, VHDL
  and Verilog, on the compiled engine against the event-driven one), `test/vga-example.test.js` (the vga
  model's frames and buttons), `test/ui/open-toolchain.test.js` (Generate and Emulate on the compiled engine;
  the vga example's model draws its picture).
