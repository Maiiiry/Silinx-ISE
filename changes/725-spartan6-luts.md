In detail:

- **Spartan-6: where every LUT's bits are (#725):** research/s6/db/xc6slx16-lut.json and xc6slx45-lut.json, measured
  with ISE on the Mac mini: designs in XDL with every slice's four LUTs set to 1, 0, A1 … A6 and to its number's bits
  (research/s6/gen-lutmap6.mjs), turned into bitstreams by ISE's xdl and bitgen (ise-xdl-bits.sh) and read by
  ana-lutmap6.mjs. Each LUT's 64 bits lie in 4 frames of its slice's column, laid out alike in every slice of a kind
  (SLICEX, SLICEL, SLICEM), and a slice's base follows from its column and Y alone: the XC6SLX16 measured whole (9112
  LUTs), the XC6SLX45 from a sample of 1204 slices and that rule. Tests: test/s6-lutmap.test.js.
