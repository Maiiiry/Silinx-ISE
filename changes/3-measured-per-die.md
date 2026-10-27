In detail:

- **Device measurements, one data folder per die (#3):** research/s3e-device/build-measured.mjs rebuilds the measured
  description of any Spartan-3E die Silinx supports from `data/<die>/` (`--part`, the die's layout; `PARTS`, `dieOf`,
  `measuredDies`), the first step of the plan for the XC3S100E, XC3S500E and XC3S1200E; chip.mjs names the description
  as its device's part. The XC3S250E's rebuild is unchanged. Tests: test/s3e-device.test.js (every measured die rebuilt
  byte for byte; a part of no supported die and a die with no measurements refused, the file missing named).
