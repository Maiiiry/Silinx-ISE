In short:

- **Faster deep logic:** the open synthesis restructures deep arithmetic written as gates (multipliers, adders,
  comparators) at both Optimization Efforts: the EPFL multiplier, max and adder benchmarks are now faster than
  with ISE.

In detail:

- **The GIA's SOP balancing, a candidate of the deep designs (#654, #655, #52):** a design whose usual netlist is
  more than 16 levels of logic deep (of 20 000 LUTs at most) is also mapped by ABC's `&sopb` (the logic balanced
  as sums of products on its GIA, then `&if -g` and `&synch2`, twice) onto LUT4s, at both efforts, and that
  netlist kept when better by the depth-oriented mapping's rule (at Normal, for a design too large for High's
  mappings, only when a quarter faster). Measured by ISE's trce on the routed designs (XC3S1200E, I/O wrapper):
  the EPFL multiplier 93.2 ns -> 61.6 (ISE 66.8; 16 % more slices, still 29 % fewer than ISE's), max 27.3 ->
  22.5 (ISE 25.7, fewer slices), adder 13.3 -> 11.4 (ISE 12.2: 8 levels of LUTs as ISE's, in place of the
  128-bit carry chain). `r.depth.sopb` says what happened.
