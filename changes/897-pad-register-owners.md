In detail:

- **Bit database, XC3S500E / XC3S1200E:** bits of some pads' input registers that a neighbouring pad's features held,
  measured with ISE (an IDDR2 on one pad alone) and moved to their pad: A3's set / reset and second flip-flop (held by
  B3), C9's input delay (E9), B9's, C15's and D13's second flip-flop (D9, A16, E12). A register with a set / reset on A3,
  or one on C9 alone, is now byte-identical to ISE's; the board test `feat_iob_owners` (#897).
