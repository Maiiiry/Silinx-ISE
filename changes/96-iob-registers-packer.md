In short:

- **Silinx toolchain: registers in the IOBs and tristate outputs:** a flip-flop goes into the I/O block of its
  pad when the UCF asks for it (`IOB = TRUE`), and an output that can be high-impedance (`'Z'`) with its
  enable from a register in the IOB builds to a bitstream.

In detail:

- **The packer's IOB registers (#96):** the input, output and output-enable registers go into the IOB of
  their pad on request (the UCF's IOB = TRUE / FALSE on a net or an instance, with wildcards; the HDL's IOB
  attribute; the pack option iobRegs as map's -pr), none by default as ISE's flow runs map -pr off; their
  settings as ISE's map writes them (the bit database's features of #44), the input delay ISE's map chooses
  by itself. OBUFT: the enable on T1 or from its register. The static timing's arcs of the IOB registers
  (estimates until trce's are measured) and the simulation models' flip-flops and X_OBUFT.
- **The placer: an I/O with registers on a pad where they are measured (#96):** the bit database measured each
  register kind on part of the pads (an output-enable register with a reset on about half); a port with IOB
  registers and no LOC is kept on the pads where its settings are measured (`knownRouting(db).allowPad`).
  A LOC'd one is not moved: the bitstream writer refuses the settings its pad lacks and names them, as it
  does a tristate enable from the fabric (TMUX T1, not measured yet). The open-flow board test
  `test/fixtures/open-flow/feat_iobreg` (Basys2-250) and the same design without LOCs on the four devices.
