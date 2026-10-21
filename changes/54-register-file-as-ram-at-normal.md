In short:

- **Silinx toolchain, synthesis at effort Normal:** the T80 (Z80) takes about as many slices as with XST at the default
  effort too (1009 instead of 1146), its register file in distributed RAM, and is 6 % faster by ISE's timing analysis.

In detail:

- **The memories as distributed RAM at effort Normal (#54):** a design that gets none of High's mappings and whose usual
  run left memories written to in logic makes two more Yosys runs: the memories as RAM16X1D with the usual mapping, and
  that netlist balanced onto LUT4s alone (High's smallest balancing); the same rule as at High chooses (the fewest
  slices, kept by `DEPTH_RULE` and no slower by the estimate). On the design corpus at Normal: the T80 1146 → 1009
  slices, trce 21.67 → 20.36 ns (the netlist High keeps); IWLS'05 simple_spi 89 → 79 slices, 6.16 → 5.94 ns routed; every
  other netlist the same. `lutram: false` leaves it out.
