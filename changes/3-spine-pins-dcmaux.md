In detail:

- **Device measurements, the XC3S100E's spine, block-RAM pins and long lines (#3):** `varyjoins.mjs spine` writes the
  clock spine's ambiguous joins with their spine candidates, tested from a BUFGMUX in rounds; it leaves out a row's
  `GCLKH_GCLK_UP` / `_DN` wire, whose test from a BUFGMUX reaches the other end over a row join not yet known (9
  such tests gave a wrong join). `varyjoins.mjs pins` writes a block RAM's pin wires' ambiguous joins (the XC3S100E's
  4 block RAMs, clocked alike in every design). The long lines' switch boxes include the XC3S100E's `DCMAUX_TL_CENTER`
  / `DCMAUX_BL_CENTER` tiles (`DCM_SWITCH`): its 38 long-line nodes a short could come from. Tests:
  test/s3e-device.test.js (`spineVariants`, `pinVariants`, `DCM_SWITCH`).
