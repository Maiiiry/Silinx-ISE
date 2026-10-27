In short:

- **Silinx C++: hls::stream:** a stream argument is Vitis HLS's ap_fifo (read: `_dout`, `_empty_n`, `_read`; written:
  `_din`, `_full_n`, `_write`), its accesses waiting while the FIFO is empty or full; the C simulation's streams are
  queues; co-simulation models the FIFOs.

In detail:

- **hls::stream (#1590):** core/c-parse.js (the type `hls::stream<T>`, a template's `>>`), core/c-check.js (its member
  functions; a stream inside the module said), core/cpp-tree.js (a stream by reference is the stream; `s >> x`,
  `s << v`), core/c-interp.js / c-interp-expr.js (a queue: read, write, empty, full, size, read_nb, write_nb; each
  call's values in, read and written recorded; a read of an empty stream stops the run), core/c-fifo.js with
  core/c-fsmd.js and c-mem.js (ap_fifo: a state per access that waits, the value read in a register; empty() and
  full() the flags), core/c-cosim.js (FIFOs in the test bench, empty and full now and then); core/c-hdl.js: an
  argument named as a reserved word (in) keeps its outputs on its renamed ports (in_r_…: a stream's, a memory's).
  Tests: test/cpp-stream.test.js (against the C++ compiler with a stream of its own; co-simulated in VHDL and Verilog;
  a wrong value reported; the errors).
