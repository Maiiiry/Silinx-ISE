In detail:

- **The measured XC3S250E description: all 43 test designs through ISE, as fast as on the shipped graph (#3):** the
  clock rows no design used and the I/O columns' clock lines below them measured (`varyjoins.mjs rows`, join tests from
  a global buffer), the tests' router given every non-CLB tile's PIPs, and the tiles on the device report's grid
  (`build.mjs`: tiles of one X / Y shared a place, and the placer took the clock tiles' CLB column for the wrong half).
  The 7 examples and the 36 open-flow designs of the Basys2-250 pass ISE's DRC with a byte-identical bitstream; ISE's
  critical period is 0.17% longer on average than on the shipped graph (research/s3e-device README section 13).
