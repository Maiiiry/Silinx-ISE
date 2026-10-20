In short:

- **Faster designs with the Silinx toolchain:** the router gives the critical path's connections the fast
  wires other nets held: about 1.3 % shorter critical paths on average (up to 15 % on small control designs).

In detail:

- **The router's polish of the critical path (#662, #651):** once the routing is legal, the critical path's
  connections one at a time, the slowest first, each one's own branch routed again on the wires no other net
  uses, or on those of less critical nets, which are then routed again around it; a change is kept only when
  the critical path is no longer. The timing passes after the routing is legal are 4 (were 2), at a lower
  congestion factor, so that a critical net can take a contested wire. On 19 designs (the slowest of the
  corpus against ISE, those with multipliers or block RAMs, and the examples; three placements each) the
  critical path is 1.3 % shorter by Silinx's analysis (itc99-b08 −5 %, itc99-b12 −6 %, T80 −1.6 %), none
  longer; the routing takes about 1.3 times as long.
