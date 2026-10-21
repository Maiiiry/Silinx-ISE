In detail:

- **The carry chains' netlist chosen both ways (#742):** a design written as gates is mapped with and without its
  carry chains (#77); the netlist without them is now kept only when better than the one with them by `DEPTH_RULE`,
  not by default whenever the chains' was not better (`keepChains`). Since the SOP balancing (#654) the EPFL adder in
  the design corpus had kept a netlist 44 % faster by the estimate with 4 times the LUTs (171 → 676) and 74 % more
  slices, routed only 9 % faster: it has its chains again (171 LUTs, 194 slices, 12.98 ns). The EPFL max keeps its
  chains too: 1437 → 1367 LUTs, 27.9 → 23.6 ns. A netlist whose chains Yosys finds driven twice (the EPFL
  multiplier's rewrite, #746) is never kept. The EPFL multiplier's (+15 % LUTs, 38 % faster) and bar's (24 more
  flip-flops replicated, 7 % faster) results since #654 are recorded as the corpus's expectations.
