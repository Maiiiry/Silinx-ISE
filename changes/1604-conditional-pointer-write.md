In detail:

- **A pointer written under a condition, then read (#1604):** where the condition does not hold it reads the caller's
  value, as C: the pointer is an input from the start (its ports `_i`, `_o`, `_o_ap_vld`, as Vitis HLS's ap_ovld), the
  combinational flow run again so (core/c-dataflow.js, c-dataflow-expr.js); the generated HDL gave 0 there. Tests:
  test/c-cosim.test.js (combinational and sequential, co-simulated in VHDL and Verilog).
