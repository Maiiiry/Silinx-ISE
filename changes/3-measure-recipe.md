In detail:

- **Device measurements, the recipe for the other dies, part 1 (#3):** research/s3e-device/measure.mjs: `designs` writes
  every observation design of a part into one folder for ISE (38 on the XC3S100E), `observe` observes the ones ISE
  implemented and names the others. gen-obshdl.mjs's pads design is sized to the part (`padDefaults`): 81 pads on the
  XC3S100E-CP132, which bonds 83 (the XC3S250E's 90 did not fit), 230 / 248 on the XC3S500E / XC3S1200E-FG320, the
  XC3S250E's 90 unchanged. Tests: test/s3e-device.test.js (the defaults of the four parts, their designs read with no
  error or warning; the 38 designs, a second run refused, the designs ISE did not implement).
