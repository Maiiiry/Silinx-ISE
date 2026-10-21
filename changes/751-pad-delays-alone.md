In short:

- **An input register on a pad whose neighbour is unused:** the Silinx toolchain's bitstream is now byte-identical to
  ISE's there too: on the XC3S500E and XC3S1200E such a register (on B3, E17, F14 or G13, for example) set a bit that
  belongs to the input-only pad next to it.

In detail:

- **The pads' input delays measured with each pad used on its own (#751):** #97 solved them from designs where every pad
  had an input, so a bit of one pad's delay could go to its neighbour's. The issue's five bits are each the input-only
  pad's next to the I/O tile (46,31 / 47,31 A3's register, not B3's; 538,356 D18's, not E17's; 767,740 and 767,996 the
  XC3S1200E's E17 and E18's, not F14 and G13's), and designs with only some pads used found more such bits on all four
  devices. New measurements with ISE (research/s3e-bitstream: `gen-pairdly.mjs`, `gen-paddly.mjs`: every pad's kind and
  delay varied apart from its neighbours', 2 020 designs; `ana-paddly.mjs` gives each bit to the one pad it follows):
  1 199 of the 10 051 delay features change (`measured/fix-28-pad-delays.json`, applied by `pad-delays.mjs` at the end
  of `build-db.sh`), and every measured design, the 32 held-out random ones too, is byte-identical to ISE's bitgen. New
  board test `feat_iob_lone` (lone input registers on the XC3S500E, and on the XC3S1200E in the ISE tests). Tests:
  `test/iob-reg.test.js` (the five bits as ISE sets them with each pad alone, no delay bit in two pads' features,
  `pad-delays.mjs --check`), `test/open-flow.test.js`, `test/ise/open-flow.test.js`.
