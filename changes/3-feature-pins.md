In detail:

- **The measured XC3S250E description: the pins of the features no example uses (#3):** 61 more designs ISE implemented
  (the open-flow fixtures, `gen-obspins2.mjs`: a shift register in every CLB, an F8 in every pair of CLBs, the block RAMs'
  second clock, every BUFGMUX) give every pin the open flow uses, 55 081 pin facts all right. The observer reads an F8's
  FXINB and a multiplier's BCIN on the next tile's wire, a side BUFGMUX's O, and the last loose ends of a net as the one
  pairing that makes it a tree (a DCM's path to its BUFGMUX); the rules join the carry chains in every tile. 37 of the 43
  designs of the XC3S250E route on the measured graph (research/s3e-device README section 11).
