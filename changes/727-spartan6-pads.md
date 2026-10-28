In detail:

- **Spartan-6: the pads' bits (#727):** research/s6/db/xc6slx16-iob.json, measured with ISE: designs with every bonded pad
  of the CSG324 an IOB of one setting (research/s6/gen-iob6.mjs; the output and input, the drives, slews, I/O standards
  and pulls, as Silinx writes them) and id designs that tell the pads apart (ana-iob6.mjs): 6 bits an output and 9 an
  input on every pad, in the I/O words. Tests: test/s6-iob.test.js.
