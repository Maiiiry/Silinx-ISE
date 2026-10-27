In detail:

- **Device measurements, the observation designs sized to the XC3S100E (#3):** the wide-multiplexer design makes at
  most a quarter of the part's SLICEMs' multiplexers (`muxCount`: 120 on the XC3S100E, which has 480 SLICEMs; 300
  elsewhere), and the DCM designs' clock pad is the pad above the top edge's first DCM (`dcmClockPad`: B9 on the
  XC3S100E, whose DCMs are right of the centre, where ISE refused B8 with Place:1012; B8 on the other parts). All 38
  XC3S100E observation designs now pass ISE; the XC3S250E's are unchanged. Tests: test/s3e-device.test.js (both
  defaults on the four parts, the XC3S100E's B9 in its DCM's column and B8 left of it).
