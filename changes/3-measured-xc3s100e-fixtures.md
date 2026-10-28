In detail:

- **Device measurements, the XC3S100E's open-flow designs (#3):** the 32 `test/fixtures/open-flow` designs that route
  on the XC3S100E's shipped graph route on its measured description too, and pass ISE (DRC 0 / 0, `.bit`
  byte-identical with CRC on and off). Its measurements now take ISE's routes of 33 of those designs and `iobddr-b`
  (`gen-obspins.mjs`: the DDR registers of the pads `iobddr` leaves out), and 161 more clock tests, every verdict
  agreeing with the shipped graph. Tests: test/s3e-device.test.js (`iobDdr` `alt`, the rebuild of `data/xc3s100e/`).
