In short:

- **Faster designs with wide state decoding:** a critical function of 6 or 7 signals that no LUT tree makes shallower
  is now built as XST does, LUTs into the slice's wide multiplexers (MUXF5, MUXF6, MUXF7): verilog-uart 12 % faster,
  vtr-stereovision3 6 % (with fewer LUTs).

In detail:

- **The critical LUTs made shallower: the wide multiplexers, and the ends that can be (#652):** core/lut-resynth.js.
  - A critical LUT whose cone has 5 to 7 signals at a level three below it, and no form of one or two LUTs or a tree
    of LUT4s, becomes its 2^k cofactors as LUT4s into MUXF5, MUXF6 and MUXF7, selected by its k latest signals (a LUT
    level and the multiplexers). vtr-stereovision3's I2C clock line and stop, a 128-entry case of its 7-bit state,
    were 4 to 5 levels of LUTs.
  - A round makes shallower the critical ends it can and leaves the others; the pass ends when a round makes none
    (before, a round was undone when one end could not be made shallower). DEPTH_RULE keeps the result or not.
  - Measured on 20 designs of the corpus (the routed period, Silinx's STA, mean of placer seeds 1–3 where it changed):
    verilog-uart −12.2 %, vtr-stereovision3 −5.6 % (129 → 119 LUTs, 78 → 76 slices), iwls05-usb-phy −0.8 %, serv −0.6 %;
    the other 16 unchanged; every netlist simulates as its design.
