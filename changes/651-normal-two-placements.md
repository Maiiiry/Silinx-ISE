In short:

- **Faster small designs at Optimization Effort Normal with the Silinx toolchain:** Place & Route makes two placements
  of a design of 500 slices at most and keeps the faster, as High does: 1.25 % shorter critical paths on average, up to
  14 % by ISE's trce (the clock example), for a second or two more on a small design; a larger one is placed once, as
  before.

In detail:

- **Two placements at Optimization Effort Normal for a design of 500 slices at most (#651):** a placement's seed moves a
  design's critical path by several per cent, and on the small designs, the ones furthest from ISE at Normal, the
  placement is most of what is left of the gap. The flows (`core/open-flow-core.js`, Implement Design and the
  Post-Place & Route model's design) now make `effortTries(effort, slices)` placements (`core/fpga/place-route.js`):
  `HIGH_TRIES` (2) at High, `NORMAL_TRIES` (2 up to 500 slices) at Normal, else one; the console says both periods and
  the seed kept. Measured with Silinx's static timing on the corpus's 53 designs of 1500 LUTs at most and the 7
  examples at Normal (the same netlists): 1.25 % shorter in geometric mean over the 60 (two placements for every size:
  1.42 %), 23 designs faster (verilog-axis-fifo −11.2 %, the clock example −10.4 %, spi-fpga-slave −7.3 %,
  uart-for-fpga −5.6 %, verilog-i2c-master −4.8 %, epfl-i2c −4.5 %), one slower (iwls05-usb-phy +2.2 %: register
  replication from the other placement), the slices the same. The place and route of a small design takes 0–2 s more;
  of 400–700 slices it would take 1.5 times as long, so those keep one placement. By ISE's trce on the 24 changed
  routings: 2.38 % shorter in geometric mean (the clock example −14.3 %, verilog-axis-fifo −9.1 %, vga −5.3 %,
  spi-fpga-slave −5.2 %, verilog-lfsr-crc −4.6 %), 6 slower by 2.1 % at most, every bitstream byte-identical to ISE's
  bitgen with a clean DRC. research/s3e-route/README.md, "Two placements at Normal for a small design".
