In short:

- **Silinx toolchain, timing report:** the report of *Generate Post-Place & Route Static Timing* now gives
  each input's setup and hold to its clock, the clock-to-pad time of each output, the pad-to-pad paths and
  the hold slack between flip-flops, as trce's data sheet does.

In detail:

- **Static timing: the pads' paths, hold and clock skew (#26):** `timing.js` `analyzeTiming(...).pads` and
  `timingReport`. The global clock reaches every flip-flop at once (trce's clock skew is 0.000 ns there). The
  pads' delays, the clock's insertion delay, trce's minimum delays (0.751 of the model's) and a flip-flop's
  hold time are fitted to trce's data sheet of lab11 placed and routed by Silinx and by ISE: within 0.08-0.19 ns
  rms of trce (research/s3e-route/README.md, "Pad paths, hold and clock skew"). An asynchronous set / reset
  is left out, as trce does. A clock from a DCM and paths between two clocks: #601.
