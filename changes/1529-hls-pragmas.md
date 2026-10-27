In short:

- **Silinx C: the HLS pragmas:** a loop's `#pragma HLS PIPELINE` (an iteration a clock cycle) and `UNROLL`
  (`factor=N`, or the whole loop), `ARRAY_PARTITION complete`; Vitis HLS's other pragmas accepted with a warning.

In detail:

- **The HLS pragmas (#1529):** core/c-pragma.js: which pragmas Silinx makes, where each applies, the warnings of those
  accepted and ignored (and of the unknown or misplaced ones), the errors of wrong values; in a sequential module
  (core/c-fsmd.js) `PIPELINE` puts a loop's condition, body and step in one state, `UNROLL` runs a constant loop in the
  state it is in or N iterations a state, `ARRAY_PARTITION complete` keeps a large array in registers; what a pragma
  cannot make there is said, with the II made. `cToHdl` gives a report (states, register bits, memories, each loop's
  II and cycles). A `static` or global memory with no initial values starts at zeros, as C (it started undefined, #1592).
  docs/c-to-hdl.md. Tests: test/c-pragma.test.js (the cycles co-simulated in VHDL and Verilog, the messages).
