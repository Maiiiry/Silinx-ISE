In short:

- **The open toolchain on a measured description of the XC3S250E:** the seven examples and 33 of the 36 open-flow test
  designs of the Basys2-250 (block RAMs, DCMs, multipliers, shift registers, I/O registers, DDR), routed on a description
  of the chip measured with ISE alone, pass ISE's checks with a bitstream byte-identical to ISE's. The shipped
  description stays.

In detail:

- **The measured XC3S250E description: the clock column by index, the I/O columns' clock lines; 40 designs through ISE
  (#3):** `varyjoins.mjs` asks the arc probe and the join tests the clock column's PIPs and joins at every index, and the
  I/O columns' clock lines at every index and tile; every verdict agrees with the shipped graph. The 40 designs that route
  on the measured graph pass `check-open-flow`: DRC 0 / 0, no warning, `.bit` byte-identical with CRC on and off. Three
  fixtures still fail (research/s3e-device README section 12).
