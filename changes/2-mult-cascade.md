In short:

- **Cascaded multipliers:** MULT18X18SIO instances that take B from the multiplier below (B_INPUT = CASCADE, BCOUT ->
  BCIN) build with the Silinx toolchain.

In detail:

- **The multiplier cascade in the Silinx toolchain (#2):** the packer connects BCIN / BCOUT as ISE's map does (a
  cascading multiplier's B left open: ISE's DRC warns otherwise) and refuses BCOUT into anything but the same bit of a
  cascading multiplier's BCIN; the placer puts a chain on consecutive sites of a column (the site above in the routing
  graph on every device) and keeps it there; the router takes the column's dedicated switches. The test simulators
  model B_INPUT and BCOUT. A new open-flow fixture, feat_mult_chain.
