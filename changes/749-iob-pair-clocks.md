In short:

- **Two IOB registers on different clocks in one I/O tile:** the Silinx toolchain no longer ends with "the routing did
  not converge" when two pads of one tile hold registers on different clocks.

In detail:

- **The two IOBs of a differential pair share each clock wire of their I/O tile (#749):** registers of one kind (input,
  or output / output enable) in a DIFFM / DIFFS pair on different clocks made the routing fail to converge. As ISE does
  (checked with ISE 14.7 on the Basys2-250: input and output registers, both ports' orders), the DIFFM's register goes
  on the IOB's second flip-flop (IFF2 / OFF2 / TFF2), clocked from the tile's second clock wire (IOIS_CLK4 / 5), with
  the static timing and the Post-Place & Route model following it; ISE's DRC is clean on that routed XDL. Pads without
  a LOC are kept out of such a pair by the placer (the bit database does not have the second flip-flop's settings on a
  pad alone yet, #759): a LOC'd pair is said with a warning naming the ports, their clocks and the tile, and the
  bitstream writer names the settings it lacks. `feat_iob_pair` (new): registers on two clocks, their pads left to the
  placer, byte-identical to ISE's bitgen.
