In detail:

- **The toolchain's package, silinx-fpga, as a workspace of this repository (#1677):** the first part of step 6 of
  the toolchain's separation (#1651, docs/TOOLCHAIN-SEPARATION.md). packages/silinx-fpga/ with its package.json
  (private until it is published, #1681; its own version, 0.1.0; its dependency @yowasp/yosys at the version the
  IDE pins) and its Apache-2.0 LICENSE (its code and its data, as decided), and the root's `workspaces`. It holds no
  code yet: the toolchain moves into it in the next pull requests. The third-party notices leave this repository's
  own packages out (scripts/third-party.mjs). Tests: test/silinx-fpga-package.test.js. No behaviour change.
