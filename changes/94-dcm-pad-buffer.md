In detail:

- **Silinx toolchain: a clock pad's global buffer into a DCM's CLKIN (#94):** the placer chooses the DCM's
  site and that buffer together, matched with the DCM's outputs: the clock on the GCLK pin whose buffer's
  line reaches the DCM's CLKIN (B8 -> BUFGMUX_X2Y11 -> the top-left DCM; C8 -> BUFGMUX_X2Y10 on the
  XC3S100E), the outputs on the other buffers. Before, the outputs took the buffers first, and the pad's
  buffer, not reaching the CLKIN, was said in a warning and reached through general routing. A board test
  (feat_dcm_bufgin) on the four devices, checked against ISE.
