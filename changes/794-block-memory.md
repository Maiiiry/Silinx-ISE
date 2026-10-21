In short:

- **Block Memory:** New Source ▸ Block Memory writes a RAM or a ROM of the device's block RAMs (width × depth,
  one or two ports, its contents from a .mem or .coe file of the project), showing how many block RAMs it takes
  of the device's. Opening the module in the Design pane reopens the wizard.

In detail:

- **New Source ▸ Block Memory (#794):** the name, language and location; the memory: RAM or ROM, one port or two
  (A and B, each its own clock), width × depth, READ_FIRST or WRITE_FIRST, the block RAM primitives or the
  inferable HDL, its initial contents from a `.mem` (`$readmemh`'s format) or `.coe` file of the project (its
  errors said); the block RAMs it takes against the device's (`core/resources.js`: RAMB16s, or the Spartan-6's
  9 Kbit halves), one that does not fit refused. The module (`core/blockram.js`): the shape with the fewest blocks
  (RAMB16_Sw / RAMB16_Sw_Sw, the parity bits as data; RAMB8BWER / RAMB16BWER counted in halves), then the fewest
  rows, side by side for the width and in rows for the depth (the high address bits choose a row's write enable
  and, registered, the output), their INIT_xx / INITP_xx from the file; or an array read on the clock edge, its
  initial words written in (XST's templates; the Silinx toolchain maps it to the same RAMB16). Its settings in a
  `silinx-wizard:` header line: the Design pane shows *[Block Memory] [VHDL]*, and reopening it reads the file
  again. Three board tests of its output (`feat_bramwiz`, `feat_bramwiz_v`, `feat_bramwiz_inf`) build on the four
  Spartan-3E devices of the Silinx toolchain. In Portuguese.
