In short:

- **Timing of the pads of a DCM's clocks:** the Silinx toolchain's OFFSET IN / OUT checks and its data sheet (pad to
  setup, hold, clock to pad) now cover the inputs and outputs of a DCM's clocks, which they left out ("no pad of the
  design is bounded by it"): deskewed by the DCM, with its phase shift and, for a falling-edge register, half the
  clock's period, as ISE's trce times them; within 0.13 ns of trce on average.

In detail:

- **A DCM's clocks at the pads, fitted to trce (#601, the second part):** `clockArrivals` gives a DCM's clocks the
  arrival at its CLKIN plus `SPEED_4.clock.dcm` (the deskew: CLKIN from a pad or from a global line, DESKEW_ADJUST's
  taps), then the output's phase (its first edge times the pad's PERIOD; a falling-edge flip-flop half its period
  later), three arrivals as trce counts them: the latest (clock to pad), the earliest (setup) and the inputs' hold.
  `analyzeTiming` takes the UCF's clocks (`opts.clocks`) for the phases; `checkOffsets` finds a DCM clock's pad; a pad
  bounded on two clocks names each in the report, the warning and the report's constraints ("met on sw<0>, clock
  clkfx_b"). Measured with trce on six DCM designs (research/s3e-route/dcm-timing.mjs, ISE's own flow and Silinx's
  routing with a PCF in map's form; dcm-timing-compare.mjs): the derived constraints and the requirements between two
  clocks are the first part's (CLK0 -> CLKFX 6.666, CLKFX -> CLK2X 3.334), the skew between a DCM's outputs within
  ±0.02 ns and the clock uncertainty 0 (none counted); model - trce on Silinx's routing: setup rms 0.131 ns, hold
  0.094, clock to pad 0.116 (27 values each), the data paths between two clocks 0.179. New board tests
  `feat_dcm_cross` (CLK0, CLK2X, CLKFX, CLKDV and a falling edge into each other, OFFSET on two clocks; its CLKFX ->
  CLK2X path not met on Silinx's routing, as trce finds) and `feat_dcm_phase` (a fixed phase shift, CLK90, CLK180).
  Tests: `test/fpga-timing.test.js` (the arrivals' terms, the six routings against trce's numbers in
  test/fixtures/fpga/trce, the OFFSET lines, the trce report reader and the PCF), `test/open-flow-core.test.js` (a
  DCM's OFFSET in Implement Design, its one expected warning), `test/open-flow.test.js` (the two board tests).
