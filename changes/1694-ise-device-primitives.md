In short:

- **ISE schematic export of a device primitive:** a BUFG, BUFGMUX, IBUFG, DCM_SP, block RAM or MULT18X18SIO (and
  Spartan-6's primitives) is written as ISE's own library symbol with its attributes, and read back as the same
  symbol with its parameters: the exported project needs no extra file, and the clock is no longer lost.

In detail:

- **Device primitives as ISE's library symbols (#1694):** the ISE schematic export writes a device primitive as the
  library symbol of its UNISIM primitive (BUFG, RAMB16_S9_S18 …, at the pin positions and with the timestamps of
  ISE 14.7's spartan3e and spartan6 libraries), its parameters as the block's attributes (a block RAM's contents as
  its INIT_xx), instead of an `xl_bufg` symbol of its own; the import reads such a block, from Silinx or from an ISE
  project, as the Silinx primitive with its attributes as its parameters (a BUFG or an IBUFG is no longer a plain
  buffer). A RAMB16 with port A wider than port B, which ISE's library has not, stays a Silinx symbol. The drawing of
  the primitives whose pins are not in ISE's order is #1798.
