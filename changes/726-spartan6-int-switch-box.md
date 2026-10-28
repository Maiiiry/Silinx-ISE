In detail:

- **Spartan-6: the INT switch box's routing bits (#726):** research/s6/db/xc6slx16-int.json and -int-cover.json, measured
  with ISE: a PIP on a net with an outpin is programmed whether or not it is on the net's path, so one design measures
  a PIP in each of the thousand INT tiles (research/s6/gen-pipprobe6.mjs; all 3449 PIPs in 8 designs); the PIPs whose
  source must be driven (a wire's continuations, a bidirectional PIP's other direction) on paths from a driver
  (gen-pipcover6.mjs). Checked against the examples ISE implemented on both boards (check-pips6.mjs): 2534 of 2560
  INT tiles identical, the rest the clock-break rows' PIPs still to measure. Tests: test/s6-pips.test.js.
