In detail:

- **A schematic corpus (#1687):** `test/schematic-corpus/`, as the design, diagram and HLS corpora: 17 hand-made
  schematics (bus taps of every kind and orientation, bus joins, net names, the library's gates, flip-flops,
  registers, counters, multiplexers, decoders, arithmetic, VCC / GND and constants, tri-state buffers, BUFG, module
  symbols of another schematic, curved wires and crossings), the ISE fixtures and the gates example, each with a
  behavioural reference; and the design corpus's designs converted to schematics at run time. Each goes through the
  document's round trip, the schematic's checks, Check Syntax of its VHDL and Verilog, their simulation against the
  reference, the ISE export and import, Yosys and the Silinx toolchain to a `.bit` on the four Silinx-toolchain
  devices, with each stage's exact results and warnings in `expected.json` (`npm run test:schematics`, `--update`;
  the fast stages in `test/schematic-corpus.test.js`). What it found is in #1688–#1695 and #1697.
