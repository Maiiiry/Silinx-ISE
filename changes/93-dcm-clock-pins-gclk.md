In detail:

- **Silinx toolchain: a global buffer's net into a DCM's CLKIN / CLKFB on the global lines (#93):** the
  router's search of a clock net, kept on the global clock network, now takes the last switch off it into
  the DCM's pin (`GCLKn -> DCM_CLKIN -> DCM_CLKIN_PINWIRE`): a cascaded DCM's CLKIN, a DCM's feedback and a
  CLKIN from a pad's buffer no longer go through general routing (`CLKT_TO_OMUX`, hexes and doubles), which
  added clock skew. Checked on the four devices (feat_dcm2, feat_dcm_bufgin); the routing of designs
  without a DCM is unchanged.
