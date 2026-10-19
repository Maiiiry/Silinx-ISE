In short:

- **Silinx toolchain, a wrong circuit fixed:** the open synthesis's wide-multiplexer mapping could build a circuit
  that does not do what the HDL says (secworks' SHA-256 core); it now maps only complete multiplexer trees.

In detail:

- **Open synthesis: only full multiplexer trees onto MUXF5 / MUXF6 / MUXF7 (#554):** Yosys's muxcover with partial
  trees (some leaves missing) made a wrong netlist of secworks-sha256's core (the design corpus's netlist against
  the RTL: a mismatch of the digest at cycle 99), with the F-multiplexers or 2:1 multiplexers in their place alike;
  `muxcover -nopartial` keeps it right. It showed once the packer's slice count (#528) made the synthesis keep
  that mapping for the design. iwls05-spi keeps its gain (#511): 13.76 ns, 357 slices.
