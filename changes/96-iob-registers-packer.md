In short:

- **Silinx toolchain: registers in the IOBs and tristate outputs:** a flip-flop goes into the I/O block of its
  pad when the UCF asks for it (`IOB = TRUE`), and outputs that can be high-impedance (`'Z'`) are no longer
  refused by the packer.

In detail:

- **The packer's IOB registers (#96):** the input, output and output-enable registers go into the IOB of
  their pad on request (the UCF's IOB = TRUE / FALSE on a net or an instance, with wildcards; the HDL's IOB
  attribute; the pack option iobRegs as map's -pr), none by default as ISE's flow runs map -pr off; their
  settings as ISE's map writes them (the bit database's features of #44), the input delay ISE's map chooses
  by itself. OBUFT: the enable on T1 or from its register. The static timing's arcs of the IOB registers
  (estimates until trce's are measured) and the simulation models' flip-flops and X_OBUFT. A setting the bit
  database has not measured on a pad yet (a register without clock enable or set / reset on most pads, the
  enable from the fabric) is refused by the bitstream writer, as before.
