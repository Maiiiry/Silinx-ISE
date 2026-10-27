In short:

- **HDL to C:** a module's C model (Processes ▸ View C Model): C computing what Silinx's simulator computes, a struct
  of its signals and `_init`, `_eval`, and a sequential one's `_step` (a clock's rising edge), for a C test bench or
  to read the design as C.

In detail:

- **HDL to C (#1530):** core/hdl-c.js, hdl-c-expr.js, hdl-c-stmt.js: an elaborated design (VHDL, Verilog, a drawing's
  generated HDL) as C99: its processes as C functions in delta cycles, the clocked ones once a step, its HDL functions
  as C functions, every value at the width and with the sign extension the simulator evaluates it with (two-state);
  what cannot be modelled said with its line (a falling edge, two clocks, a wait, more than 64 bits). web/js/c-model.js
  and processes.js: View C Model (both views), the model read-only. docs/c-to-hdl.md. Tests: test/hdl-c.test.js (the
  examples' modules and designs of the operators: the model compiled with cc and the simulator on the same random
  cycles, the same outputs), test/ui/c-model.test.js (both interfaces, Portuguese).
