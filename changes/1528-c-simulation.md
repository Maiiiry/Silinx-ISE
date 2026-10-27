In short:

- **C simulation and C/RTL co-simulation:** the C editor runs the test bench, `main()` (its printf's output in the
  Console), and replays its calls of the top function on the generated HDL, comparing the results (PASS or each
  mismatch) and giving the latency of a sequential module, as Vitis HLS's C simulation and co-simulation do.

In detail:

- **C simulation and co-simulation (#1528):** core/c-interp.js and core/c-interp-expr.js (an interpreter of Silinx C:
  C's and ap_int's arithmetic, pointers, arrays of arrays, statics, printf's conversions; each call of the top
  function recorded; stopped with its line on a division by zero, an index outside an array, an endless loop),
  core/c-cosim.js (the calls replayed on the VHDL or Verilog, combinational or through ap_ctrl_hs, compared call by
  call and port by port; the latency), web/js/c-source.js and app.js (the editor's C Simulation and C/RTL
  Co-simulation buttons); a value made a bool is 1 when it is not 0 in the generated HDL (it took the lowest bit).
  Tests: test/c-interp.test.js (against cc's output), test/c-cosim.test.js, test/c-hdl.test.js, test/ui/c-sim.test.js.
