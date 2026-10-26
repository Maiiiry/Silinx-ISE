In detail:

- **C to HDL, the specification (#1523):** docs/c-to-hdl.md: Silinx C, the subset of C (with Vitis HLS's `ap_int<W>` /
  `ap_uint<W>`) that Silinx will turn into VHDL and Verilog, compatible with AMD's Vitis HLS: the source, the types and
  their arithmetic, what can be synthesized, the module made (Vitis HLS's ports and block protocol), the pragmas, how
  it is checked, the phases (#1532).
