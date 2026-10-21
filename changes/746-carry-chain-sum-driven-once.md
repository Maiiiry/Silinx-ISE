In detail:

- **Carry chains written as gates: a sum that starts another chain driven once (#746):** in an AND-inverter graph a
  sum is an AND of two inverted nets, so it was also found as the first carry (c = a & b) of the chain that adds it
  next, and both chains' rewrites drove it (Yosys's "multiple conflicting drivers": the EPFL multiplier 10 nets, sin 4,
  log2 16). Such a chain now starts at its next bit, the sum its carry in, and no bit is redriven twice. A regression
  test: an adder whose sum is the carry in of a second one, its netlist simulated against the design.
- **The netlist without the chains kept when larger by no more times than it is faster (#746):** the multiplier's
  netlist with its chains, now correct, was kept by the choice of #742 (2.1 times slower by the estimate, 128.6 ns
  routed instead of 63.9, for 36 % fewer slices); the one without them is kept again (the EPFL adder keeps its chains:
  1.8 times slower for a quarter of the LUTs).
