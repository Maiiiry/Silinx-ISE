In detail:

- **The plan to separate the Silinx toolchain from the IDE (#1651):** docs/TOOLCHAIN-SEPARATION.md maps the
  toolchain's modules, their tests and data, its coupling with the IDE in both directions and its licence, compares
  a separate repository, an npm workspace and a git subtree, and plans `silinx-fpga` (Apache-2.0) as a workspace
  package first, in ten steps that change no behaviour (#1672 to #1681), then in a repository of its own; and
  the HDL front end as `silinx-hdl`, a package that stays in this repository (#1709 to #1711).
