In short:

- **Static timing of block RAMs and multipliers:** the Silinx toolchain's timing report now gives a design with
  block RAMs or multipliers the period ISE's timing analyzer gives the same routing (hard_prim 7.11 ns by Silinx,
  7.15 by ISE; 8.39 before).

In detail:

- **Static timing: the block RAMs' and multipliers' arcs as trce times them (#457):** measured with trce -a -v 1000
  on nine routed designs (hard_prim, feat_bram, feat_const_bram, feat_mult, feat_const_mult, feat_constmult,
  stopwatch and two of multipliers with input registers), they replace the estimates: a block RAM's clock to out
  2.812 ns (was 2.39), its setups the same at every width and write mode; a multiplier's A / B -> P grows with the
  product bit (3.657 ns up to P5, 4.873 from P17; was 4.9 for all), clock to P from its input registers likewise,
  an unregistered input into the product register 3.980 (was 5.2). The block-RAM interconnect wires into and out of
  a block RAM or multiplier get classes of their own (0.24 and 0 ns, were 0.3 both). Against trce on the nine
  designs the analysis is within -5.9 .. +4.2 % (mean |error| 2.6 %; it was -4.6 .. +22.1 %).
  `research/s3e-route/timing-fit.mjs --arcs` lists the block RAMs' and multipliers' arcs too.
