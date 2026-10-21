In detail:

- **Bit database, XC3S1200E: every long-line splitter measured, and used by the router (#709):** the centre column's
  (CLKV_LL, CLKT_LL, CLKB_LL: the horizontal long lines joined across it), the I/O columns' (CLKL_IOIS_LL /
  CLKR_IOIS_LL) and the side DCM columns' (CLKLH_DCM_LL / CLKRH_DCM_LL: the vertical ones joined across the centre
  row), all 48 switches of each, one bit each, measured with ISE (`research/s3e-bitstream/ll-splitters.mjs`, 46
  rounds of `gen-pipcover.mjs`; a switch's bit is the one candidate all its observations share). Before, 92 of the
  336 were known and none could be routed. The router takes them where they are faster, as CLKH_LL's since #23; the
  placer's delay table leaves out the splitter types' own switches only (`knownRouting` `delayPip`). ISE's
  bitstreams of 1427 earlier XC3S1200E designs: 480 byte-identical (150 before), none left with an unknown splitter.
