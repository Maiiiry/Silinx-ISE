In short:

- **Test designs:** New Project lists, after the examples, the designs Silinx itself is tested with (Test design: …):
  seven schematics, three state diagrams and five C / C++ programs for Silinx HLS, each with its test, to open and
  run and see what Silinx does with each kind of source. In the browser edition too.

In detail:

- **Test designs as projects (#1746):** `test-designs/<name>` (listed in `core/test-designs.js`), a category of New
  Project's templates apart from the examples (not held to their rules: no board, no ISE build). The schematics of
  the schematic corpus (bus_taps, bus_join, gates_inverted, mux_dec, arith, flipflops, full_adder of two half
  adders), each with a self-checking test bench of every input (the sequential one 300 cycles against a model); the
  diagram corpus's det1011, vending and johnson16 as state diagrams, each with a test bench checking it against a
  model written another way; C programs (gcd, popcount, fir, sort) and a C++ one (stream_sum, hls::stream), whose
  `main()` returns 0 when right: C simulation, C synthesis to VHDL and Verilog and C/RTL co-simulation pass. The
  server's `/api/test-designs`, the standalone edition's bundle, the MCP server's `list_examples` (the test designs
  apart, with their kind) and `new_project_from_example` (a test design too). A new project's UCF for a board is
  now made from the HDL of its drawings and C sources too, and its constraints folder made when missing.
  `test/test-designs.test.js` makes each into a project and checks Check Syntax's exact warnings and its test.
