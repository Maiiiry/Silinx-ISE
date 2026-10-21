In detail:

- **Carry chains written as gates: a sum that starts another chain driven once (#746):** in an AND-inverter graph a
  sum is an AND of two inverted nets, so it was also found as the first carry (c = a & b) of the chain that adds it
  next, and both chains' rewrites drove it (the EPFL multiplier: 10 nets driven twice, Yosys's "multiple conflicting
  drivers"). Such a chain now starts at its next bit, the sum its carry in, and no bit is redriven twice; the
  multiplier's netlist with its chains has one driver per net. A regression test: an adder whose sum is the carry in
  of a second one, its netlist simulated against the design.
