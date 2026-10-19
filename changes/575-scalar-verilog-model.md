In short:

- **A faster Verilog Post-Synthesis Model:** the Verilog Post-Synthesis Simulation Model is written a wire a bit and
  simulates about four times faster (as fast as the VHDL one).

In detail:

- **The Post-Synthesis Simulation Model's Verilog a wire a bit (#575):** Yosys's Verilog netlist kept its buses,
  each primitive driving one bit of one, so that a change of one bit woke every primitive reading another bit of
  the bus: the vga example's Verilog model simulated about 4 times slower than its VHDL one. The postsynth step
  now writes the netlist split (`splitnets`, the top's ports still buses, the same cells), and the unit test of
  the vga example on that model is in a file of its own, `test/sim-model-synth-vga.test.js`, which runs alongside
  the other examples'.
