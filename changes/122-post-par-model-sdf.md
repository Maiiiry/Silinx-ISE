In short:

- **Silinx toolchain, Post-Place & Route Simulation Model with timing:** *Generate Post-Place & Route Simulation
  Model* no longer needs Xilinx ISE: the routed design as a model (VHDL and Verilog) and its timing as an SDF
  file; *Simulate Post-Place & Route Model* runs it with the delays, the glitches a gate filters and the setup
  checks (a too fast clock is reported as timing violations). No process needs ISE in the Silinx toolchain now.

In detail:

- **Post-Place & Route Simulation Model of the Silinx toolchain, its SDF (#122):** `build/netgen/par/<top>_timesim.vhd`
  (and `.v`) of SIMPRIM primitives with their LOC, and `build/netgen/par/<top>_timesim.sdf`: every connection's
  delay (the static timing's, PORT) and every element's paths (each path through a slice split over its elements,
  their sum the timing's) and setup checks. The model's design is synthesized with the test bench's generics, then
  placed and routed as Place & Route does. Its longest path is the static timing's minimum period; against ISE's
  netgen SDF of the same routed design (blinky), the connections differ by 16 ps on average (rms 69 ps) and the
  minimum period by 1.2 % (`research/s3e-route/sdf-compare.mjs`).
- **SDF annotation in Silinx's simulator (#122):** `core/sdf.js` reads an SDF and builds it into a netlist (VHDL or
  Verilog): transport wire delays, inertial gate delays, clock to out, setup checks (from 100 ns on, as ISE's GSR),
  as two elements of Silinx's SIMPRIM library evaluated natively (X_SDFDLY, X_SDFCHECK), the same results in both
  languages; *Simulate Post-Place & Route Model* applies the model's SDF (the emulator runs
  it without).
- **The examples' test benches for a timing simulation (#122):** blinky checks the inverted LEDs half a clock period
  after the switch (was 1 ns, less than the pads' delays), traffic checks its lamps and display just before each
  rising edge (was the falling edge, before the routed design's outputs settle), vga allows a quarter of a pixel
  between its two sync outputs where it times one from the other (their pads' and routes' delays differ); the same
  results in the RTL.
