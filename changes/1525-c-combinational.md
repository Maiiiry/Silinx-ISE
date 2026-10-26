In short:

- **C to HDL, combinational:** a C function with no state and loops of constant bounds becomes a VHDL or Verilog
  module with Vitis HLS's ports (`ap_start`, `ap_done`, `ap_idle`, `ap_ready`, the arguments, `ap_return`).

In detail:

- **Combinational C to HDL (#1525):** core/c-types.js (C's promotions and conversions, Vitis HLS's ap_int widths),
  core/c-graph.js (the operations, folded and shared), core/c-dataflow.js and core/c-dataflow-expr.js (the function
  run symbolically: loops unrolled, ifs and switches as multiplexers, return / break / continue as conditions, the
  functions inlined, arrays, pointer outputs and their `_ap_vld`), core/c-hdl.js (the VHDL and the Verilog; a name
  that is a reserved word of an HDL named `<name>_r`); what is not combinational yet said (#1526, #1527). Tests:
  test/c-hdl.test.js (the generated HDL simulated in both languages against the C compiled with the host's cc, 40
  random expressions included).
