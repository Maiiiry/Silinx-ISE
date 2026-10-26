In short:

- **C to HDL, sequential:** a C function with loops whose count depends on its inputs, or with static or global
  variables, becomes a state machine with Vitis HLS's block protocol (`ap_clk`, `ap_rst`, `ap_start`, `ap_done`,
  `ap_idle`, `ap_ready`).

In detail:

- **Sequential C to HDL (#1526):** core/c-fsmd.js (the function cut into basic blocks, one state each; its variables
  registers, statics and globals kept between calls; loops, ifs with loops, break, continue and return choosing the next
  state; the arguments read at `ap_start`; `ap_done` / `ap_ready` one cycle; `_ap_vld` pulses), core/c-hdl-seq.js (its
  VHDL and Verilog: the state `ap_CS_fsm` and the registers in one clocked process, each state commented with its
  line), core/c-hdl.js (a function that is not combinational made sequential); docs/c-to-hdl.md. Tests:
  test/c-seq.test.js (the protocol driven in both languages against the C compiled with cc: gcd, an integer square
  root, statics and globals, nested loops with break / continue / return, do-while, an if with a loop, arrays, a
  read-write pointer), test/c-helpers.js.
