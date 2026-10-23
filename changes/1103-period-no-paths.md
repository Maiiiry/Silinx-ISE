In short:

- **No false PERIOD warning:** a PERIOD on the clock of a design with one register stage (no path between two of its
  flip-flops) is no longer reported as "no clock of the design comes from this port"; it is met, with no path to time.

In detail:

- **A PERIOD on a clock with no path to time (#1103):** checkPeriods (core/fpga/timing-checks.js) finds the clock from
  the port among the flip-flops' clocks when the static timing has no path for it: met, `noPaths`, as trce's
  "0 paths analyzed". The timing report says so, the Design Summary's row says "no path between flip-flops to time"
  (not a period of 0 ns), and the warning stays for a port that clocks nothing.
