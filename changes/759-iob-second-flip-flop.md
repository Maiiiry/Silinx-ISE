In short:

- **I/O registers on two clocks in a differential pair:** two input (or output) registers on different clocks LOC'd on
  the two pads of a differential pair now build with the Silinx toolchain, the second on its IOB's second flip-flop as
  ISE puts it.

In detail:

- **The bit database: an IOB's second flip-flop alone (#759):** IFF2 / OFF2 / TFF2 without the first, as ISE's map
  uses them for two registers of one kind on different clocks in a differential pair, measured with ISE on every DIFFM
  pad of the four devices (research/s3e-bitstream measure-759.sh, gen-iobpair.mjs; ana-iobreg.mjs --known solves only
  the settings the database lacks). A LOC'd pair of #749 writes a complete bitstream, byte-identical to ISE's (its
  placer warning is gone).
