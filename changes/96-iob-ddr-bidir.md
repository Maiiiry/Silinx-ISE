In short:

- **IDDR2 / ODDR2 and bidirectional pads with the Silinx toolchain:** designs that instantiate the DDR registers IDDR2 and
  ODDR2, or that have inout ports (IOBUF), build to a bitstream, byte-identical to ISE's; the simulators know IDDR2 and
  ODDR2.

In detail:

- **IDDR2 / ODDR2 (#96):** simulation models (core/unisim.js, the compiled engine's core/compiled-prims.js), the packer
  putting them in their pads' IOBs with the settings and pins of ISE's map (DDR_ALIGNMENT NONE; the clock's inverter
  becomes ICLK2INV / OTCLK2INV), the static timing on both clock edges (an IOB's register pins with their own clock and
  edge), the post-translate, post-map and post-place & route models and the test simulators. The placer refuses a DDR
  register and another register of that kind on a different clock in one differential pair. The DDR input registers
  measured with ISE on every pad (measure-iobddr.sh: an earlier design had ISE trim most of them), and the bits of a
  pad's IDDR2 that its neighbour's features held given to their pad (ana-padowner.mjs). Fixtures feat_iob_ddr (VHDL)
  and feat_iob_ddr_v (Verilog).
- **Bidirectional pads (#96):** the packer's IOBUF (output on O1, enable on T1, input to the fabric), the bit database's
  IO:<standard> on every pad of the four devices in LVCMOS33, LVCMOS25 and LVTTL (measured with ISE:
  measure-iobidir.sh), the models and the test simulators. Fixtures feat_iob_bidir and feat_iob_bidir_v.
