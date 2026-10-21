In detail:

- **Device measurements: join tests from IOB inputs and block-RAM outputs (#3):** the joins no slice can drive (the I/O
  and block-RAM tiles' OMUX, the hexes that begin in an I/O tile) are tested from an IOB's input (an IBUF site for an
  input-only pad) or a block RAM's output; round 4 on the XC3S250E: 717 tests, 423 joins and 294 islands, every verdict
  agreeing with the shipped graph (research/s3e-device/README.md).
