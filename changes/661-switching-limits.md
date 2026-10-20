In short:

- **A DCM's frequency limits in the timing report:** the Silinx toolchain's timing checks each DCM's input and outputs
  against the frequencies they allow, as ISE's trce does ("Component Switching Limit"), with a warning when one is
  out of range: a CLKFX of 5 MHz with CLKIN_DIVIDE_BY_2, for one, which ISE counts as a timing error.

In detail:

- **trce's Component Switching Limit checks on the DCMs (#661):** `checkSwitching` gives each DCM's CLKIN and each
  output it drives (CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX / FX180) its period, derived from the PERIOD
  of the pad its CLKIN comes from, against the pin's minimum and maximum period as trce 14.7 checks them on the -4
  (measured on 23 designs built by ISE's own flow, `research/s3e-route/switching-limits.mjs`): CLKIN 4.166 to 200 ns
  when the DLL is used (CLK_FEEDBACK 1X / 2X), 3.002 to 5000 ns when not; CLK0 4.166 to 200, CLK2X 3.214 to 100, CLKDV
  6.249 to 3225.8, CLKFX 3.067 to 200 ns; with CLKIN_DIVIDE_BY_2, trce halves every one of them, the outputs' too. The
  timing report has a line for each ("switching limit of u_dcm/CLKFX (Tdcmpfx): NOT MET, period 200.000 ns, max
  period limit 100.000 ns (10.000 MHz), slack -100.000 ns"), the flow a `WARNING:Timing` and a timing error for each
  one not met, the Design Summary a row. Not in the packer: the limits are checked against the PERIOD constraint,
  as trce does, not CLKIN_PERIOD, and ISE's map and par accept such a DCM. The board test `feat_dcm_div2` had
  this error under ISE (CLKFX x 3 / 15 of its halved input: 200 ns): its CLKFX is now x 2 / 5, 100 ns, at trce's
  limit. Tests: `test/fpga-timing.test.js` (every limit against trce's figures on the same settings),
  `test/open-flow-core.test.js` (the old and new feat_dcm_div2 settings in the flow, the report, the warning).
