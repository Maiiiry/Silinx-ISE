In detail:

- **The toolchain's boundary as a test (#1672):** step 1 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). test/toolchain-boundary.test.js lists the toolchain's modules (core/fpga/, the
  open synthesis, the flow, its formats and parts) and the eight imports of the IDE they make today, each with its
  importer (the HDL front end, the simulation models, the technology view's schematic model), and its one npm
  package, @yowasp/yosys. A new import across the boundary fails, and an entry leaves the list once its import is
  gone. No behaviour change.
