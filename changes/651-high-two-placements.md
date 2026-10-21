In short:

- **Faster designs at Optimization Effort High with the Silinx toolchain:** Place & Route makes two placements and keeps
  the faster: 1.5 % shorter critical paths on average, up to 10 % (the clock example), for a third more place and route
  time.

In detail:

- **Two placements at Optimization Effort High (#651):** a placement's seed moves a design's critical path by several
  per cent, more than the placer's options do, so at High the flows (`core/open-flow-core.js`, Implement Design and the
  Post-Place & Route model's design) place and route the design from seeds 1 and 2 (`HIGH_TRIES`) and keep the faster
  (then register replication from it, as before); the console says both periods and the seed kept. Normal makes one
  placement, as before. Measured with Silinx's static timing on the corpus's 53 designs of 1500 LUTs at most and the 7
  examples, routed at High: 1.52 % shorter in geometric mean, 29 designs faster (3.1 % on average: verilog-axis-fifo
  −10.8 %, the clock example −10.4 %, spi-fpga-slave −7.3 %, epfl-router −6.9 %, picorv32 −4.8 %), two slower
  (iwls05-usb-phy +2.2 %, iwls05-sasc +0.1 %: register replication from the other placement), the slices the same, the
  place and route 1.33 times as long. Tried and dropped: a second, cool placement from the first one with each
  connection's estimate scaled by its routed delay (0.6 % on 15 designs, against 2.3 % for a second seed at the same
  time). By ISE's trce on the 29 changed routings: 2.92 % shorter (the clock example −14.3 %, femtorv32-quark −8.1 %,
  picorv32 −7.3 %), 8 slower by 2.3 % at most, every bitstream byte-identical to ISE's bitgen with a clean DRC.
  research/s3e-route/README.md, "Two placements at Optimization Effort High".
