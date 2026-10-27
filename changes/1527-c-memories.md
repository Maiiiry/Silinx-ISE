In short:

- **Silinx C: arrays and memories:** an array argument is a memory outside the module (Vitis HLS's `ap_memory`:
  `_address0`, `_ce0`, `_we0`, `_d0`, `_q0`), a large local, static or global array a block RAM inside it, a constant
  one a ROM; co-simulation models the argument's memory and compares it after each call.

In detail:

- **Arrays and memories (#1527):** core/c-mem.js with core/c-fsmd.js: an array argument makes the module sequential,
  its accesses through one port (a read's value the cycle after its address); a local, `static` or global array of more
  than 64 elements, and a constant one in a sequential module, is a memory inside the module (VHDL's array signal,
  Verilog's reg array, its initial values its contents: Yosys and XST make it a block RAM); each access a state of its
  own, the values read kept in registers; what is not supported yet said where it is (a write with another side
  effect, a memory passed to a function or accessed in a `switch`, an initialized local memory that is written).
  core/c-interp.js records each call's arrays before and after; core/c-cosim.js models the memory in the test bench.
  docs/c-to-hdl.md. Tests: test/c-mem.test.js (against cc, co-simulated in VHDL and Verilog, a wrong write reported,
  the RAMB16 of the open synthesis).
