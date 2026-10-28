In detail:

- **Device measurements, the XC3S100E measured (#3):** `data/xc3s100e/` holds the measurements of the XC3S100E-CP132
  (Basys2-100) and the description built from them alone; `test/s3e-device.test.js` rebuilds it byte for byte. Against
  the shipped graph: no merged node, no split node a short can come from, every valid test's verdict and every probe's
  answer agreeing; the 7 examples routed by the open flow on it pass ISE (DRC 0 / 0, `.bit` byte-identical with CRC on
  and off). The shipped graph is unchanged.
