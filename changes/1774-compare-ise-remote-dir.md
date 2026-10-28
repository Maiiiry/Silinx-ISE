In detail:

- **The ISE comparison over SSH times Silinx's routings in the ssh config's remoteDir (#1774):**
  test/designs-corpus/compare-ise.mjs copied the routings to `~/silinx-compare` on the ISE host and mounted that folder,
  which Docker Desktop refuses when it shares only some folders (#482). The trce step then failed and the run stopped.
  It now takes the host's folder as scripts/check-open-flow.mjs does (server/toolchain.js `iseWorkBase`:
  SILINX_ISE_REMOTE_DIR, else `ssh.remoteDir`, else the home as before), through a helper of its own,
  `remoteWork` (test/designs-corpus/compare-lib.mjs), tested in test/quality-page.test.js. The weekly comparison
  (`SILINX_ISE_HOST=local`) is not affected.
