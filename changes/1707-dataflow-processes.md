In short:

- **Silinx HLS: `#pragma HLS DATAFLOW`**: the top function's calls are processes running at once, each a module of
  its own, joined by FIFOs (local streams) and buffers (local arrays), as Vitis HLS makes them.

In detail:

- **DATAFLOW (#1707, step 1 of #1706):** core/c-processes.js: a DATAFLOW region of calls in the top function, each
  callee a module of its own (core/c-hdl.js made with it as the top; a callee called twice, two instances; a pointer
  argument the size of the array it is given); a local `hls::stream` a FIFO (its depth the STREAM pragma's,
  `hls::stream<T, D>`'s, else 2), a local array a buffer its readers start once its writer is done; the top's
  arguments passed to the processes; the top's `ap_ctrl_hs` over them all. The C simulation runs the calls in order,
  the co-simulation drives the same ports and names the streams that may be too shallow when a call does not end.
  View C Synthesis Report lists the processes, the FIFOs and the buffers. What is not supported yet is said; a region
  of other statements is made sequential, with a warning. Two of AMD's DATAFLOW examples (simple_fifos and
  struct_ii_issue) now run as processes.
