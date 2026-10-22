In detail:

- **core/fpga/timing.js split: the logic's arcs and the timing checks (#405):** each instance's timing arcs
  (timing-arcs.js) and the clock and constraint checks with the timing report (timing-checks.js) move to modules of
  their own; timing.js still exports them (timing.js 1203 → 729 lines). No change in behaviour: on the 70 routed
  designs of the router's and placer's tests, the timing graph, every instance's arcs, the clock sources and ports
  and the switching checks are the same as before. Tests: `test/timing-parts.test.js`.
