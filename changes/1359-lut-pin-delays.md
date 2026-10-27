In detail:

- **A LUT input's delay by its pin (#1359):** ISE's delay into a LUT depends on the input the signal enters: inputs 3
  and 4 are about 0.12 ns faster than input 1 (reportgen -delay on 31 748 connections of 9 designs of the corpus,
  the same in each). The timing model (core/fpga/timing.js, `SPEED_4.lutPin`, `lutPinIndex`) adds each pin's delay at
  the LUT's input, so the static timing is closer to trce's per connection (rms 0.119 → 0.093 ns, cross-validated by
  design) and per design (114 routings: mean −0.37 % → +0.09 %, σ 3.21 → 3.00 %). The router, which already permutes a
  LUT's inputs, now puts the critical loads on the fast ones: trce's period 0.96 % shorter in geometric mean on the 99 routings
  of the corpus that changed (59 faster, 38 slower), every DRC clean and `.bit` byte-identical to ISE's bitgen. Tests: test/fpga-timing.test.js (Silinx's routing of
  vtr-ch-intrinsics against ISE's delay of each LUT input, test/fixtures/fpga/trce; the stopwatch's critical loads
  on pins 3 and 4).
