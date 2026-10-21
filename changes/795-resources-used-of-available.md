In short:

- **Every resource used of available, an overflow said early:** the Silinx toolchain's synthesis and MAP reports and the
  Design Summary give the block RAMs, multipliers, DCMs, global clock buffers and I/O as used of the device's, and a
  design with more of one than the device has fails at synthesis (or MAP) with it named ("5 block RAMs needed, the
  XC3S100E has 4"), not at Place & Route.

In detail:

- **Resources used of available, the overflow caught at synthesis or MAP (#795, part of #787):** core/resource-check.js
  counts the resources of a netlist's cells (core/resources.js's primitives; a Spartan-6 RAMB8BWER is half a block RAM)
  and names the ones over the part's counts. The Silinx toolchain's synthesis lines carry the part's totals (also the
  Spartan-6's: DSP48A1s, RAMB16BWER/RAMB8BWERs, PLLs…) and fail on a design over any of them; MAP lists every resource
  of the device's sites (block RAMs, multipliers and DCMs too) and fails before Place, its report kept. The Design
  Summary shows every resource of the part: from MAP (ISE's unlisted ones as 0), or after the synthesis alone its
  used of available, a row over 100 % in red.
