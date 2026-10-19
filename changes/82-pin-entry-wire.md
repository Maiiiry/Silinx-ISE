In short:

- **Place & Route on the Nexys2-1200:** a design no longer fails at some placements with a net between
  neighbouring slices left unrouted.

In detail:

- **The router keeps a pin's only entry wire for the pin's net (#82):** a slice's BX / BY input is
  reached through its BX / BY wire only, which also feeds the LUT inputs of the CLB. Another net passing
  through it (`BY1 -> F1_B3`) left the pin's net with no way in; on the XC3S1200E its search then gave up
  (feat_constmult with the clock on N9, seed 3: `…Y<1> -> …BY` not routed). The wire now belongs to the
  pin's net from the first pass, so the routing has no such conflict to negotiate.
