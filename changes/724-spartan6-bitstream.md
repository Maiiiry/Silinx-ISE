In detail:

- **Spartan-6: the bitstream format, reader and writer (#724):** core/fpga/s6/bitstream.js reads and writes the
  XC6SLX16's and XC6SLX45's `.bit` files (UG380's 16-bit packets) with the packet sequence of ISE's bitgen, measured
  on the Mac mini's ISE (research/s6/ise-format.sh: the empty designs with the CRC on and off, StartUpClk Cclk /
  JtagClk, and with `-g Compress`, whose multi-frame writes gave the frame order and short CRC sequences). The CRC is
  22 bits, one step per word written (`c = c << 1 ^ (bit 21 ? 0x9081 : 0)`, then `^ register << 16 | word`), checked
  after the frame data (bitgen's auto CRC, which does not reset it) and at the end; FDRI holds each row's columns
  (frames of 65 words, 744 per row on the XC6SLX16, 1136 on the XC6SLX45, the last 2 of pad), the block RAM's frames,
  the I/O words (FLR's count) and one word; a design with a block RAM has one frame of its column written again after
  them. The empty designs and the seven examples implemented by ISE on the Nexys3 and the Atlys (42 files) are
  written again byte-identical (research/s6/check-writer6.mjs); the tests check the writer against the SHA-256 of
  bitgen's empty designs (research/s6/measured/format.json) without ISE. Tests: test/s6-bitstream.test.js.
