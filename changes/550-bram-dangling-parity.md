In detail:

- **Silinx toolchain: a 9-bit word on 2048 x 9 block-RAM ports with no free data bit, written on one port and read on
  the other, goes on 1024 x 18 ports (#550):** the design corpus's verilog-axis-fifo wrote its 9th bit on DIPA and
  left DOPA unread, and ISE's DRC warned (PhysDesignRules:1063, "a dangling output parity pin"; ISE's own map of the
  same memory warns too). When the memory uses half the port's words at most (its address MSB tied to 0 on every
  port), the packer makes each port twice as wide (2048 x 9 -> 1024 x 18, 1024 x 18 -> 512 x 36): the word on data
  bits only (contents, initial and reset values moved with it), the parity inputs tied to 0, the parity outputs
  unused. ISE (check-open-flow.mjs, XC3S250E-CP132): verilog-axis-fifo, feat_bram, feat_const_bram, hard_prim,
  feat_mult, feat_const_mult, feat_constmult and the stopwatch example: DRC 0 errors, 0 warnings, .bit
  byte-identical to ISE's bitgen (CRC on and off).
