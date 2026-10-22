In short:

- **Block RAMs and multipliers on any global clock:** a block RAM's port B and a multiplier's registers can now take any
  of the eight top and bottom global clocks in the Silinx toolchain (before, only one of them, so a design with two
  such clocks was refused), and a clock on any global clock pad reaches its buffer on the pad's dedicated path.

In detail:

- **Bit database: the block RAMs' and multipliers' clock pins from every global line, the clock pads' paths to the
  global buffers (#2):** the switches `GCLKk -> BRAM_CLKj` of the block-RAM interconnect tiles (20 of 24 were unknown)
  and `CLKT_CKIk -> CLKT_GCLKj` / `CLKB_CKIk -> CLKB_GCLKj` (13 of 16 unknown), measured with ISE on designs that clock
  every block RAM and multiplier from each line and every buffer from each of its pads
  (`research/s3e-bitstream/gen-bramclk.mjs`, `gen-clkpad.mjs`, `measure-bramclk.sh`: 10 designs, 210 xdl + bitgen
  runs). The designs are byte-identical to ISE's bitgen; `feat_bram_clocks`, refused before, routes. A clock on the
  bottom GCLK pin (M4 / N9) now takes its own buffer on its dedicated path, with no warning (#56).
