In short:

- The C and C++ editor has Language Templates (Templates ▾, and in its context menu): a top function, a test bench,
  `ap_int` and its bits, `ap_fixed`, loops with PIPELINE, UNROLL and LOOP_TRIPCOUNT, an array argument, a ROM, a
  static register, a struct; in C++ also `hls::stream`, a DATAFLOW region and an `hls::task`.

In detail:

- **The C editor's Language Templates (#1855):** Silinx HLS's templates (web/js/c-templates.js), as the HDL editor's;
  each synthesizes with no warnings and runs in the C simulation (test/c-templates.test.js); a `.c` source's are
  C's, a `.cpp` source's add C++'s; their names in Portuguese.
