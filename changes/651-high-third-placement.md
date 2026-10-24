In short:

- **Faster circuits at Optimization Effort High with the Silinx toolchain:** Place & Route makes a third placement and
  routes it when the placer estimates it faster than one of the first two: 2.2 % shorter critical paths by ISE's trce on
  the designs it changes (up to 6 %), for about a fifth more place and route time at High. Normal is unchanged.

In detail:

- **A third placement at Optimization Effort High, routed when its estimate is promising (#651):** after the router's
  fixes, the placement is most of what is left of the critical path's routing (81 % of it on the corpus's critical
  paths), and one placement's seed moves a design by several per cent. At High the flows (`core/open-flow-core.js`,
  Implement Design and the Post-Place & Route model's design) now make `effortExtra('high')` (`HIGH_EXTRA`, 1)
  placement more after the two of #811 (`core/fpga/place-route.js` `placeRouteBest` option `extra`, `placeOnly`), and
  route it only when the placer's estimate of its critical path is shorter than the longer of the first two's: a
  placement costs about a third of its routing, and the estimate tells the faster routings only roughly. Seeds 1 and 2
  are routed as before, so no design gets slower by Silinx's analysis. The console names the third: its period, or "not
  routed (estimated slower)". Measured with Silinx's static timing on the corpus's 53 designs of 1500 LUTs at most and
  the 7 examples at High (57 timed, the same netlists): 0.81 % shorter in geometric mean, 19 faster (itc99-b09 −5.8 %,
  itc99-b06 −4.9 %, verilog-lfsr-crc −4.6 %, itc99-b08 −4.5 %, fpu-adder −3.9 %), none slower, the slices the same,
  place and route ×1.20 at High. By ISE's trce on the 19 changed routings: 2.17 % shorter in geometric mean (itc99-b06
  −6.3 %, verilog-lfsr-crc −6.0 %, itc99-b09 −5.2 %, iwls05-usb-phy −3.9 %, itc99-b12 −3.7 %, the stopwatch example
  −3.5 %), 3 slower (spi-fpga-master +4.1 %, epfl-priority +2.8 %, t80 +0.2 %: periods within the static timing's
  error of trce), every bitstream byte-identical to ISE's bitgen with a clean DRC. research/s3e-route/README.md, "A
  third placement at High".
