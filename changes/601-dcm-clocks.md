In short:

- **Timing of the clocks from a DCM:** the Silinx toolchain's timing report gives each clock from a DCM the PERIOD
  constraint ISE's trce derives from its input's (CLK2X half of it, CLKDV and CLKFX by their settings, phases), where
  it said that no clock of the design came from the constrained pad; and a path from one clock's flip-flops into
  another's of the same pad is timed against the time between the two clocks' edges, a warning when it is not met.

In detail:

- **A DCM's clocks and the paths between two clocks (#601, a first part):** `clockSources` follows each clock net
  through the global buffers and DCMs (CLKIN, cascades too) to its pad, with its period and first rising edge in the
  pad's periods (CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX / FX180, CLKIN_DIVIDE_BY_2, a FIXED phase
  shift). `checkPeriods` gives a DCM's clock the constraint derived from its pad's PERIOD ("constraint PERIOD 20 ns
  on clk, CLKFX of u_dcm: 13.333 ns"). The analysis keeps the slowest path from each clock's flip-flops, by edge,
  into each other clock's (`cross`); `checkCross` times those of two clocks of one constrained pad against
  `clockRequirement`, from each launching edge to the first capturing edge after it over the clocks' common period
  (CLK0 into CLKFX x 3 / 2: 6.667 ns), and reports the others as unrelated, not timed, as trce does. The flow's
  warnings: a derived constraint not met, and "the paths from clock … to clock … not met". Not done yet, waiting
  for ISE's trce to fit them: a DCM clock's insertion delay (deskewed, close to 0 instead of a pad clock's Tgclk;
  the pads' OFFSET paths of such a clock are still left out) and the clock skew between a DCM's outputs. Tests:
  `test/fpga-timing.test.js` (the sources through two DCMs, the requirements, the derived constraints, the
  report's lines, the analysis's crossing paths), `test/open-flow-core.test.js` (a DCM's CLK0 into CLKFX, met at
  x 3 / 2 and not at x 17 / 16, the warnings).
