In detail:

- **The technology view out of core/fpga/ (#1673):** step 2 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The technology view, which draws with the IDE's schematic model, moves as it is
  from core/fpga/techview.js to core/techview.js; the old path re-exports it, so its importers (core/sim-model.js,
  the viewers, the schematic's properties) are unchanged. The toolchain's boundary (test/toolchain-boundary.test.js)
  loses the view's two imports of the IDE; the old path's re-export stays listed until its importers switch. Tests:
  test/techview.test.js on the new module, and the old path's exports checked against it. No behaviour change.
