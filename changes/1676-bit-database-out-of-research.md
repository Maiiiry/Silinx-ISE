In detail:

- **The bit database out of research/ (#1676):** step 5 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The Spartan-3E bit database the application ships moves as it is from
  research/s3e-bitstream/db to core/fpga/bitdb, next to the device graphs: core/fpga/bitdb-node.js reads it there,
  research/s3e-bitstream/db.mjs still re-exports its path (test/layering.test.js), and the experiments that build
  it (research/s3e-bitstream, research/s3e-device), the standalone build, the power measurement, the tests and the
  docs name the new folder. The site's assets keep their names (assets/<version>/bitdb/), so the published
  releases are unaffected. No behaviour change: the same bitstreams.
