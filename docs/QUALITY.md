# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-10-20 (Silinx 15.11.2, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as
tightly as it can (`-c 1`, as Silinx's packer always does) and the clock constraint is tightened to
5 ns, so that its place and route works for speed (ISE stops improving once a constraint
is met; the Silinx toolchain always places and routes for speed).

Silinx is built at its two Optimization Efforts (Process Properties of *Synthesize*): **Normal**, the
default (one mapping, the faster synthesis; since 15.11.1 also the mappings for speed of a deep design and of wide multiplexers, and the one with the wider functions), and **High**
(the mappings for speed for every design, the faster circuit); ISE at its default. *Silinx* in the tables is Normal,
*High* the other.

## Summary

- **Size:** 45 designs built by both. Logic LUTs: Silinx −18% against ISE; flip-flops
  −5%; slices −20% (geometric means of the ratios; below 0: Silinx is smaller). Silinx
  needs as few LUTs or fewer on 27 of 45.
- **Speed:** 40 designs timed by both. Critical path: Silinx +3% against ISE
  (above 0: Silinx is slower); Silinx is as fast or faster on 14 of 40. Both critical
  paths are measured by ISE's timing analyser (trce) on the routed design.
- **At Optimization Effort High:** logic LUTs −20%, slices −20% against ISE (45 designs);
  critical path −2%, as fast or faster on 20 of 40.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 15 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- These numbers are tracked to improve the Silinx toolchain (the GitHub
  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).

## Size

4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices
after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the
ratio of logic LUTs (below 1: Silinx is smaller).

| design | LUTs Silinx | LUTs High | LUTs ISE | S / I | H / I | FFs Silinx | FFs ISE | slices Silinx | slices High | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 171 | 171 | 696 | 0.25 | 0.25 | 386 | 386 | 194 | 194 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 1201 | 1201 | 939 | 1.28 | 1.28 | 264 | 269 | 601 | 601 | 534 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 286 | 286 | 222 | 1.29 | 1.29 | 0 | – | 143 | 143 | 111 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 50 | 43 | 48 | 1.04 | 0.90 | 0 | – | 25 | 25 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 373 | 1.00 | 1.00 | 265 | 265 | 187 | 187 | 190 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 471 | 489 | 589 | 0.80 | 0.83 | 278 | 270 | 236 | 249 | 355 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 82 | 64 | 1.28 | 1.28 | 0 | – | 41 | 41 | 32 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-log2 | 10682 | 10682 | 9911 | 1.08 | 1.08 | 0 | – | 5341 | 5341 | 4959 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1234 | 1234 | 1386 | 0.89 | 0.89 | 643 | 643 | 715 | 715 | 927 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-multiplier | 7574 | 7574 | 12245 | 0.62 | 0.62 | 257 | 278 | 3787 | 3787 | 6162 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 214 | 214 | 417 | 0.51 | 0.51 | 137 | 137 | 117 | 117 | 257 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 63 | 50 | 125 | 0.50 | 0.40 | 64 | 64 | 32 | 36 | 87 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-sin | 2001 | 2001 | 1855 | 1.08 | 1.08 | 0 | – | 1001 | 1001 | 928 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-voter | 2353 | 2323 | 4170 | 0.56 | 0.56 | 1003 | 1003 | 1177 | 1162 | 2526 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 710 | 642 | – | – | – | 224 | – | 419 | 410 | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 486 | 486 | 699 | 0.70 | 0.70 | 389 | 389 | 338 | 338 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 404 | 384 | 539 | 0.75 | 0.71 | 404 | 406 | 241 | 231 | 397 | 0 / 0 | 0 / 0 | 4 / 4 |
| itc99-b01 | 13 | 9 | 12 | 1.08 | 0.75 | 5 | 10 | 7 | 5 | 6 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b02 | 4 | 4 | 4 | 1.00 | 1.00 | 4 | 4 | 2 | 2 | 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b03 | 28 | 29 | 78 | 0.36 | 0.37 | 30 | 35 | 16 | 15 | 45 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b04 | 139 | 139 | – | – | – | 66 | – | 105 | 105 | – | 0 / – | 0 / – | 0 / – |
| itc99-b05 | 293 | 294 | 241 | 1.22 | 1.22 | 34 | 43 | 245 | 259 | 123 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b06 | 10 | 10 | 9 | 1.11 | 1.11 | 8 | 8 | 5 | 5 | 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b07 | 79 | 78 | – | – | – | 43 | – | 51 | 56 | – | 0 / – | 0 / – | 0 / – |
| itc99-b08 | 34 | 29 | 37 | 0.92 | 0.78 | 21 | 21 | 18 | 17 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b09 | 42 | 40 | 47 | 0.89 | 0.85 | 28 | 28 | 21 | 20 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b10 | 50 | 38 | 53 | 0.94 | 0.72 | 17 | 24 | 25 | 21 | 29 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b11 | 123 | 117 | – | – | – | 31 | – | 97 | 94 | – | 0 / – | 0 / – | 0 / – |
| itc99-b12 | 315 | 315 | 362 | 0.87 | 0.87 | 119 | 141 | 168 | 168 | 214 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b13 | 68 | 69 | – | – | – | 53 | – | 41 | 44 | – | 0 / – | 0 / – | 0 / – |
| itc99-b14 | 1060 | 1137 | – | – | – | 334 | – | 667 | 740 | – | 0 / – | 0 / – | 2 / – |
| itc99-b15 | 1986 | 1875 | – | – | – | 528 | – | 1294 | 1237 | – | 0 / – | 0 / – | 0 / – |
| itc99-b17 | 6400 | 5605 | – | – | – | 1464 | – | 4113 | 3710 | – | 0 / – | 0 / – | 0 / – |
| itc99-b20 | 2153 | 2234 | – | – | – | 492 | – | 1320 | 1432 | – | 0 / – | 0 / – | 2 / – |
| itc99-b21 | 2180 | 2341 | – | – | – | 492 | – | 1347 | 1511 | – | 0 / – | 0 / – | 2 / – |
| itc99-b22 | 3265 | 3265 | – | – | – | 706 | – | 1998 | 1998 | – | 0 / – | 0 / – | 2 / – |
| iwls05-i2c | 251 | 260 | 225 | 1.12 | 1.16 | 129 | 127 | 136 | 141 | 121 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-sasc | 89 | 104 | 46 | 1.93 | 2.26 | 118 | 54 | 66 | 66 | 47 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-simple-spi | 149 | 157 | 124 | 1.20 | 1.27 | 131 | 67 | 83 | 89 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-spi | 672 | 672 | 717 | 0.94 | 0.94 | 230 | 229 | 355 | 355 | 430 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-ss-pcm | 33 | 33 | 35 | 0.94 | 0.94 | 79 | 78 | 42 | 42 | 44 | 1 / 2 | 0 / 0 | 0 / 0 |
| iwls05-usb-phy | 103 | 103 | 88 | 1.17 | 1.17 | 106 | 100 | 64 | 64 | 71 | 1 / 0 | 0 / 0 | 0 / 0 |
| light8080 | 313 | 313 | 855 | 0.37 | 0.37 | 206 | 237 | 192 | 192 | 482 | 0 / 0 | 2 / 1 | 0 / 0 |
| nandland-spi-verilog | 44 | 44 | – | – | – | 37 | – | 32 | 32 | – | 0 / – | 0 / – | 0 / – |
| nandland-spi-vhdl | 42 | 42 | – | – | – | 37 | – | 31 | 31 | – | 0 / – | 0 / – | 0 / – |
| neorv32 | 2900 | 2900 | – | – | – | 1319 | – | 1679 | 1679 | – | 0 / – | 6 / – | 0 / – |
| picorv32 | 1264 | 1264 | – | – | – | 767 | – | 706 | 706 | – | 0 / – | 2 / – | 0 / – |
| secworks-aes | 8679 | 8679 | – | – | – | 2996 | – | 4346 | 4346 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha1 | 2064 | 2032 | – | – | – | 1533 | – | 1042 | 1025 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha256 | 2860 | 2860 | – | – | – | 1809 | – | 1436 | 1436 | – | 0 / – | 0 / – | 0 / – |
| secworks-siphash | 1228 | 1228 | 1180 | 1.04 | 1.04 | 798 | 798 | 686 | 686 | 727 | 0 / 0 | 0 / 0 | 0 / 0 |
| serv | 309 | 314 | – | – | – | 355 | – | 193 | 212 | – | 1 / – | 1 / – | 0 / – |
| spi-fpga-master | 26 | 26 | 29 | 0.90 | 0.90 | 21 | 21 | 18 | 18 | 17 | 0 / 0 | 0 / 0 | 0 / 0 |
| spi-fpga-slave | 21 | 21 | 50 | 0.42 | 0.42 | 21 | 20 | 14 | 14 | 29 | 0 / 2 | 0 / 0 | 0 / 0 |
| t80 | 2153 | 2153 | 1874 | 1.15 | 1.15 | 361 | 247 | 1146 | 1146 | 1000 | 0 / 0 | 0 / 0 | 0 / 0 |
| uart-for-fpga | 58 | 56 | 52 | 1.12 | 1.08 | 53 | 52 | 41 | 42 | 38 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-axis-fifo | 16 | 16 | – | – | – | 32 | – | 19 | 19 | – | 0 / – | 1 / – | 0 / – |
| verilog-i2c-master | 193 | 196 | 266 | 0.73 | 0.74 | 72 | 91 | 115 | 114 | 145 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-lfsr-crc | 100 | 99 | – | – | – | 64 | – | 53 | 50 | – | 0 / – | 0 / – | 0 / – |
| verilog-lfsr-prbs | 16 | 16 | – | – | – | 31 | – | 16 | 16 | – | 0 / – | 0 / – | 0 / – |
| verilog-uart | 129 | 148 | 160 | 0.81 | 0.93 | 79 | 79 | 120 | 125 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-ch-intrinsics | 141 | 141 | 154 | 0.92 | 0.92 | 509 | 425 | 266 | 266 | 273 | 0 / 1 | 0 / 0 | 0 / 0 |
| vtr-diffeq1 | 410 | 408 | 346 | 1.18 | 1.18 | 451 | 451 | 262 | 261 | 321 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-diffeq2 | 309 | 309 | 312 | 0.99 | 0.99 | 258 | 258 | 160 | 160 | 208 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-mkPktMerge | 256 | 256 | 4018 | 0.06 | 0.06 | 962 | 8153 | 716 | 716 | 5812 | 0 / 153 | 0 / 0 | 0 / 0 |
| vtr-sha | 1583 | 1583 | 2255 | 0.70 | 0.70 | 893 | 900 | 800 | 800 | 1149 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-stereovision3 | 127 | 127 | 109 | 1.17 | 1.17 | 120 | 101 | 77 | 77 | 92 | 0 / 4 | 0 / 0 | 0 / 0 |

## Speed

The critical path of the routed design (the minimum clock period, or the longest path of a
design without a clock; ns, shorter is faster), both by ISE's trce. *Silinx estimate*: Silinx's own
timing analysis (what its Design Summary shows).

| design | Silinx (trce) | High (trce) | ISE (trce) | S / I | H / I | Silinx estimate | High estimate |
|---|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 13.34 | 13.34 | 12.25 | 1.09 | 1.09 | 12.91 | 12.91 |
| epfl-bar | 10.64 | 10.64 | 9.08 | 1.17 | 1.17 | 10.62 | 10.62 |
| epfl-dec | 6.05 | 6.05 | 6.12 | 0.99 | 0.99 | 6.09 | 6.09 |
| epfl-i2c | 7.23 | 6.33 | 6.81 | 1.06 | 0.93 | 7.33 | 6.46 |
| epfl-max | 27.75 | 27.75 | 25.68 | 1.08 | 1.08 | 28.22 | 28.22 |
| epfl-multiplier | 93.42 | 93.42 | 66.76 | 1.40 | 1.40 | 99.38 | 99.38 |
| epfl-priority | 8.78 | 8.78 | 20.83 | 0.42 | 0.42 | 8.96 | 8.96 |
| epfl-router | 10.15 | 6.62 | 9.36 | 1.08 | 0.71 | 10.36 | 6.82 |
| epfl-voter | 25.44 | 25.13 | 29.59 | 0.86 | 0.85 | 26.44 | 25.98 |
| femtorv32-quark | 18.58 | 17.40 | – | – | – | 19.14 | 17.02 |
| fpu-adder | 10.88 | 10.88 | 12.07 | 0.90 | 0.90 | 10.59 | 10.59 |
| fpu-multiplier | 14.47 | 14.34 | 14.61 | 0.99 | 0.98 | 14.65 | 14.18 |
| itc99-b01 | 2.99 | 2.73 | 3.80 | 0.79 | 0.72 | 2.98 | 2.51 |
| itc99-b02 | 2.08 | 2.08 | 3.19 | 0.65 | 0.65 | 1.95 | 1.95 |
| itc99-b03 | 5.51 | 6.29 | 5.29 | 1.04 | 1.19 | 5.60 | 6.04 |
| itc99-b04 | 13.76 | 13.76 | – | – | – | 14.22 | 14.22 |
| itc99-b05 | 12.02 | 10.78 | 9.82 | 1.22 | 1.10 | 11.61 | 10.72 |
| itc99-b06 | 3.49 | 3.49 | 3.19 | 1.09 | 1.09 | 3.25 | 3.25 |
| itc99-b07 | 6.47 | 5.34 | – | – | – | 6.58 | 5.42 |
| itc99-b08 | 7.69 | 6.39 | 5.87 | 1.31 | 1.09 | 7.71 | 6.42 |
| itc99-b09 | 6.56 | 5.71 | 5.90 | 1.11 | 0.97 | 6.72 | 5.79 |
| itc99-b10 | 6.47 | 4.81 | 4.90 | 1.32 | 0.98 | 6.36 | 4.62 |
| itc99-b11 | 8.96 | 9.43 | – | – | – | 8.95 | 9.62 |
| itc99-b12 | 9.61 | 9.61 | 7.79 | 1.23 | 1.23 | 9.72 | 9.72 |
| itc99-b13 | 7.92 | 7.43 | – | – | – | 7.87 | 7.44 |
| itc99-b14 | 34.29 | 33.00 | – | – | – | 35.14 | 33.17 |
| itc99-b15 | 19.87 | 17.60 | – | – | – | 20.21 | 18.05 |
| itc99-b17 | 22.54 | 21.41 | – | – | – | 22.69 | 21.72 |
| itc99-b20 | 33.56 | 32.91 | – | – | – | 33.96 | 33.06 |
| itc99-b21 | 33.79 | 33.47 | – | – | – | 33.68 | 33.97 |
| itc99-b22 | 34.39 | 34.39 | – | – | – | 34.81 | 34.81 |
| iwls05-i2c | 9.51 | 8.77 | 5.91 | 1.61 | 1.48 | 9.80 | 8.99 |
| iwls05-sasc | 5.59 | 4.99 | 4.85 | 1.15 | 1.03 | 5.51 | 5.00 |
| iwls05-simple-spi | 7.00 | 6.36 | 6.22 | 1.12 | 1.02 | 7.20 | 6.46 |
| iwls05-spi | 13.32 | 13.32 | 13.04 | 1.02 | 1.02 | 13.23 | 13.23 |
| iwls05-ss-pcm | 4.81 | 4.81 | 4.83 | 1.00 | 1.00 | 4.83 | 4.83 |
| iwls05-usb-phy | 5.43 | 5.43 | 4.99 | 1.09 | 1.09 | 5.51 | 5.51 |
| light8080 | 12.51 | 12.51 | 15.13 | 0.83 | 0.83 | 12.79 | 12.79 |
| nandland-spi-verilog | 5.39 | 5.39 | – | – | – | 5.49 | 5.49 |
| nandland-spi-vhdl | 5.31 | 5.31 | – | – | – | 5.27 | 5.27 |
| neorv32 | 15.04 | 15.04 | – | – | – | 14.93 | 14.93 |
| picorv32 | 11.48 | 11.48 | – | – | – | 11.52 | 11.52 |
| secworks-aes | 27.18 | 27.18 | – | – | – | 27.57 | 27.57 |
| secworks-sha1 | 16.20 | 17.03 | – | – | – | 16.26 | 17.62 |
| secworks-sha256 | 22.84 | 22.84 | – | – | – | 23.11 | 23.11 |
| secworks-siphash | 14.19 | 14.19 | 13.98 | 1.02 | 1.02 | 14.07 | 14.07 |
| serv | 13.54 | 12.85 | – | – | – | 13.89 | 12.81 |
| spi-fpga-master | 4.84 | 4.84 | 4.99 | 0.97 | 0.97 | 4.76 | 4.76 |
| spi-fpga-slave | 5.83 | 5.83 | 4.94 | 1.18 | 1.18 | 5.97 | 5.97 |
| t80 | 21.96 | 21.96 | 18.13 | 1.21 | 1.21 | 22.20 | 22.20 |
| uart-for-fpga | 4.89 | 4.77 | 4.69 | 1.04 | 1.02 | 4.76 | 4.89 |
| verilog-axis-fifo | 5.99 | 5.99 | – | – | – | 6.15 | 6.18 |
| verilog-i2c-master | 9.82 | 9.38 | 9.88 | 0.99 | 0.95 | 10.21 | 9.69 |
| verilog-lfsr-crc | 3.82 | 3.70 | – | – | – | 3.81 | 3.77 |
| verilog-lfsr-prbs | 2.17 | 2.17 | – | – | – | 2.17 | 2.17 |
| verilog-uart | 10.53 | 8.22 | 9.24 | 1.14 | 0.89 | 10.00 | 8.10 |
| vtr-ch-intrinsics | 5.76 | 5.76 | 5.06 | 1.14 | 1.14 | 5.93 | 5.93 |
| vtr-diffeq1 | 38.70 | 34.49 | 35.80 | 1.08 | 0.96 | 36.59 | 35.26 |
| vtr-diffeq2 | 25.91 | 25.91 | 26.74 | 0.97 | 0.97 | 25.84 | 25.84 |
| vtr-mkPktMerge | 7.45 | 7.45 | 9.27 | 0.80 | 0.80 | 7.27 | 7.27 |
| vtr-sha | 15.41 | 15.41 | 19.92 | 0.77 | 0.77 | 15.32 | 15.32 |
| vtr-stereovision3 | 5.86 | 5.86 | 4.92 | 1.19 | 1.19 | 8.59 | 8.59 |

### The critical paths: logic and routing

Each critical path above as trce details it: its levels of logic, its logic delay (the LUTs, the carry
chains, the flip-flops' clock to out and setup; *LUT*, *carry*: the LUTs' and the carry chains' share of it)
and its routing delay (ns). More levels or LUT delay than ISE's: the synthesis; more routing: the placement
and the routing.

- Silinx: 26 designs slower than ISE; against ISE's critical paths, on average, logic
  +1.57 ns, routing +0.67 ns.
- High: 20 designs slower than ISE; against ISE's critical paths, on average, logic
  +2.00 ns, routing +0.34 ns.

| design | levels Silinx | levels High | levels ISE | logic Silinx | logic High | logic ISE | LUT Silinx | LUT High | LUT ISE | carry Silinx | carry High | carry ISE | route Silinx | route High | route ISE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 64 | 64 | 8 | 9.87 | 9.87 | 6.75 | 0.00 | 0.00 | 6.09 | 8.86 | 8.86 | 0.00 | 3.47 | 3.47 | 5.32 |
| epfl-bar | 6 | 6 | 4 | 5.28 | 5.28 | 4.87 | 4.63 | 4.63 | 4.22 | 0.00 | 0.00 | 0.00 | 5.36 | 5.36 | 4.20 |
| epfl-dec | 4 | 4 | 4 | 3.59 | 3.59 | 3.65 | 3.00 | 3.00 | 3.06 | 0.00 | 0.00 | 0.00 | 2.46 | 2.46 | 2.43 |
| epfl-i2c | 5 | 4 | 4 | 4.53 | 3.65 | 4.48 | 3.87 | 3.06 | 2.98 | 0.00 | 0.00 | 0.00 | 2.63 | 2.69 | 2.33 |
| epfl-max | 19 | 19 | 17 | 15.15 | 15.15 | 13.79 | 14.50 | 14.50 | 13.20 | 0.00 | 0.00 | 0.00 | 12.53 | 12.53 | 11.89 |
| epfl-multiplier | 87 | 87 | 38 | 63.40 | 63.40 | 31.33 | 62.81 | 62.81 | 28.10 | 0.00 | 0.00 | 0.00 | 30.00 | 30.00 | 35.40 |
| epfl-priority | 6 | 6 | 18 | 5.14 | 5.14 | 14.67 | 3.71 | 3.71 | 13.17 | 0.00 | 0.00 | 0.00 | 3.64 | 3.64 | 6.15 |
| epfl-router | 9 | 5 | 6 | 7.33 | 4.74 | 6.34 | 6.74 | 4.14 | 4.78 | 0.00 | 0.00 | 0.00 | 2.81 | 1.88 | 3.01 |
| epfl-voter | 18 | 17 | 21 | 13.83 | 13.30 | 17.20 | 13.24 | 12.71 | 14.09 | 0.00 | 0.00 | 0.00 | 11.61 | 11.83 | 12.39 |
| femtorv32-quark | 24 | 20 | – | 13.04 | 11.57 | – | 6.52 | 5.04 | – | 3.70 | 3.17 | – | 5.43 | 5.77 | – |
| fpu-adder | 6 | 6 | 30 | 6.05 | 6.05 | 8.62 | 3.04 | 3.04 | 1.65 | 1.51 | 1.51 | 6.31 | 4.83 | 4.83 | 3.43 |
| fpu-multiplier | 16 | 15 | 16 | 11.10 | 10.85 | 11.15 | 0.00 | 0.00 | 0.00 | 5.64 | 5.39 | 5.62 | 3.35 | 3.48 | 3.46 |
| itc99-b01 | 2 | 1 | 3 | 2.24 | 1.53 | 2.90 | 1.65 | 0.00 | 2.25 | 0.00 | 0.00 | 0.00 | 0.75 | 1.20 | 0.91 |
| itc99-b02 | 1 | 1 | 1 | 1.43 | 1.43 | 1.48 | 0.84 | 0.84 | 0.89 | 0.00 | 0.00 | 0.00 | 0.65 | 0.65 | 0.65 |
| itc99-b03 | 3 | 3 | 4 | 3.42 | 3.43 | 3.70 | 2.28 | 2.22 | 3.11 | 0.00 | 0.00 | 0.00 | 2.08 | 2.85 | 1.58 |
| itc99-b04 | 15 | 15 | – | 10.58 | 10.58 | – | 3.87 | 3.87 | – | 6.12 | 6.12 | – | 3.18 | 3.18 | – |
| itc99-b05 | 8 | 7 | 8 | 7.45 | 6.57 | 6.82 | 2.98 | 2.49 | 4.21 | 2.14 | 1.76 | 1.96 | 4.56 | 4.21 | 2.99 |
| itc99-b06 | 1 | 1 | 1 | 1.97 | 1.97 | 1.43 | 0.76 | 0.76 | 0.84 | 0.00 | 0.00 | 0.00 | 1.52 | 1.52 | 1.48 |
| itc99-b07 | 3 | 3 | – | 3.42 | 3.75 | – | 2.28 | 2.55 | – | 0.00 | 0.00 | – | 3.05 | 1.57 | – |
| itc99-b08 | 4 | 4 | 5 | 4.07 | 4.11 | 4.41 | 2.93 | 2.96 | 3.82 | 0.00 | 0.00 | 0.00 | 3.62 | 2.28 | 1.47 |
| itc99-b09 | 4 | 3 | 5 | 4.13 | 3.31 | 4.46 | 2.98 | 2.17 | 3.87 | 0.00 | 0.00 | 0.00 | 2.43 | 2.40 | 1.44 |
| itc99-b10 | 3 | 2 | 3 | 3.31 | 2.94 | 2.89 | 2.17 | 1.73 | 2.30 | 0.00 | 0.00 | 0.00 | 3.16 | 1.87 | 2.01 |
| itc99-b11 | 6 | 6 | – | 6.01 | 5.78 | – | 3.58 | 3.52 | – | 0.00 | 0.00 | – | 2.94 | 3.65 | – |
| itc99-b12 | 6 | 6 | 5 | 5.60 | 5.60 | 4.86 | 4.39 | 4.39 | 4.27 | 0.00 | 0.00 | 0.00 | 4.02 | 4.02 | 2.94 |
| itc99-b13 | 6 | 6 | – | 5.52 | 5.31 | – | 2.93 | 1.46 | – | 1.45 | 1.45 | – | 2.39 | 2.11 | – |
| itc99-b14 | 36 | 37 | – | 21.65 | 21.86 | – | 12.57 | 11.86 | – | 5.33 | 6.99 | – | 12.60 | 11.06 | – |
| itc99-b15 | 17 | 23 | – | 13.89 | 12.62 | – | 9.32 | 6.67 | – | 2.14 | 3.17 | – | 5.96 | 4.98 | – |
| itc99-b17 | 16 | 18 | – | 12.77 | 12.38 | – | 10.19 | 8.37 | – | 1.44 | 3.42 | – | 9.76 | 9.03 | – |
| itc99-b20 | 35 | 34 | – | 22.30 | 20.85 | – | 13.39 | 10.38 | – | 5.03 | 4.99 | – | 11.25 | 12.06 | – |
| itc99-b21 | 24 | 35 | – | 20.67 | 22.68 | – | 13.17 | 10.01 | – | 3.63 | 5.43 | – | 13.12 | 10.79 | – |
| itc99-b22 | 36 | 36 | – | 22.30 | 22.30 | – | 13.33 | 13.33 | – | 5.07 | 5.07 | – | 12.09 | 12.09 | – |
| iwls05-i2c | 6 | 5 | 4 | 5.53 | 4.89 | 4.19 | 4.39 | 3.74 | 2.98 | 0.00 | 0.00 | 0.00 | 3.98 | 3.88 | 1.72 |
| iwls05-sasc | 3 | 2 | 2 | 3.42 | 2.61 | 3.09 | 2.28 | 1.46 | 1.41 | 0.00 | 0.00 | 0.00 | 2.16 | 2.38 | 1.75 |
| iwls05-simple-spi | 4 | 3 | 4 | 4.13 | 3.32 | 4.58 | 2.98 | 2.11 | 2.87 | 0.00 | 0.00 | 0.00 | 2.81 | 3.03 | 1.63 |
| iwls05-spi | 11 | 11 | 9 | 9.37 | 9.37 | 7.21 | 3.17 | 3.17 | 3.97 | 5.61 | 5.61 | 0.00 | 3.95 | 3.95 | 5.83 |
| iwls05-ss-pcm | 2 | 2 | 1 | 2.67 | 2.67 | 1.97 | 1.46 | 1.46 | 0.76 | 0.00 | 0.00 | 0.00 | 2.14 | 2.14 | 2.86 |
| iwls05-usb-phy | 3 | 3 | 2 | 3.37 | 3.37 | 3.23 | 2.17 | 2.17 | 1.46 | 0.00 | 0.00 | 0.00 | 2.05 | 2.05 | 1.74 |
| light8080 | 6 | 6 | 9 | 7.58 | 7.58 | 8.14 | 4.39 | 4.39 | 6.68 | 0.00 | 0.00 | 0.00 | 4.93 | 4.93 | 6.99 |
| nandland-spi-verilog | 4 | 4 | – | 4.33 | 4.33 | – | 1.65 | 1.65 | – | 2.03 | 2.03 | – | 1.05 | 1.05 | – |
| nandland-spi-vhdl | 4 | 4 | – | 4.20 | 4.20 | – | 1.60 | 1.60 | – | 2.01 | 2.01 | – | 1.10 | 1.10 | – |
| neorv32 | 11 | 11 | – | 8.79 | 8.79 | – | 3.58 | 3.58 | – | 1.85 | 1.85 | – | 6.20 | 6.20 | – |
| picorv32 | 13 | 13 | – | 7.43 | 7.43 | – | 3.52 | 3.52 | – | 2.41 | 2.41 | – | 4.05 | 4.05 | – |
| secworks-aes | 12 | 12 | – | 9.90 | 9.90 | – | 8.89 | 8.89 | – | 0.00 | 0.00 | – | 17.25 | 17.25 | – |
| secworks-sha1 | 11 | 22 | – | 8.25 | 10.19 | – | 5.39 | 6.15 | – | 2.27 | 3.45 | – | 7.86 | 6.84 | – |
| secworks-sha256 | 24 | 24 | – | 14.91 | 14.91 | – | 7.56 | 7.56 | – | 6.76 | 6.76 | – | 7.91 | 7.91 | – |
| secworks-siphash | 27 | 27 | 34 | 9.50 | 9.50 | 9.29 | 2.30 | 2.30 | 1.60 | 6.61 | 6.61 | 7.11 | 4.68 | 4.68 | 4.66 |
| serv | 7 | 6 | – | 8.87 | 9.15 | – | 5.15 | 5.42 | – | 0.00 | 0.00 | – | 4.59 | 3.63 | – |
| spi-fpga-master | 2 | 2 | 2 | 3.02 | 3.02 | 2.67 | 1.52 | 1.52 | 1.46 | 0.00 | 0.00 | 0.00 | 1.82 | 1.82 | 2.32 |
| spi-fpga-slave | 3 | 3 | 2 | 3.37 | 3.37 | 2.61 | 2.17 | 2.17 | 1.46 | 0.00 | 0.00 | 0.00 | 2.38 | 2.38 | 2.31 |
| t80 | 14 | 14 | 18 | 11.71 | 11.71 | 12.00 | 8.72 | 8.72 | 8.91 | 2.03 | 2.03 | 2.50 | 10.23 | 10.23 | 6.13 |
| uart-for-fpga | 2 | 2 | 2 | 2.48 | 2.91 | 3.02 | 0.84 | 1.41 | 1.52 | 0.00 | 0.00 | 0.00 | 2.41 | 1.86 | 1.67 |
| verilog-axis-fifo | 3 | 2 | – | 4.12 | 3.76 | – | 2.28 | 1.91 | – | 0.00 | 0.00 | – | 1.87 | 2.23 | – |
| verilog-i2c-master | 7 | 6 | 6 | 6.15 | 5.54 | 6.15 | 3.63 | 4.39 | 4.44 | 1.38 | 0.00 | 0.00 | 3.67 | 3.84 | 3.73 |
| verilog-lfsr-crc | 2 | 2 | – | 2.18 | 2.24 | – | 1.60 | 1.65 | – | 0.00 | 0.00 | – | 1.64 | 1.46 | – |
| verilog-lfsr-prbs | 1 | 1 | – | 1.49 | 1.49 | – | 0.84 | 0.84 | – | 0.00 | 0.00 | – | 0.69 | 0.69 | – |
| verilog-uart | 6 | 6 | 13 | 5.92 | 5.18 | 6.70 | 2.98 | 2.11 | 1.60 | 1.44 | 1.57 | 4.51 | 4.61 | 3.04 | 2.53 |
| vtr-ch-intrinsics | 4 | 4 | 4 | 3.70 | 3.70 | 3.59 | 3.11 | 3.11 | 3.00 | 0.00 | 0.00 | 0.00 | 2.06 | 2.06 | 1.47 |
| vtr-diffeq1 | 17 | 12 | 16 | 24.63 | 24.14 | 26.95 | 3.11 | 3.06 | 0.70 | 4.19 | 1.87 | 10.63 | 14.06 | 10.34 | 8.85 |
| vtr-diffeq2 | 14 | 14 | 9 | 16.44 | 16.44 | 17.80 | 2.88 | 2.88 | 0.00 | 2.17 | 2.17 | 5.93 | 9.47 | 9.47 | 8.94 |
| vtr-mkPktMerge | 5 | 5 | 4 | 4.94 | 4.94 | 3.65 | 2.30 | 2.30 | 3.06 | 2.04 | 2.04 | 0.00 | 2.51 | 2.51 | 5.62 |
| vtr-sha | 13 | 13 | 21 | 9.62 | 9.62 | 12.22 | 4.58 | 4.58 | 4.52 | 4.45 | 4.45 | 7.05 | 5.78 | 5.78 | 7.70 |
| vtr-stereovision3 | 3 | 3 | 2 | 3.37 | 3.37 | 2.66 | 2.17 | 2.17 | 1.52 | 0.00 | 0.00 | 0.00 | 2.49 | 2.49 | 2.25 |

## Not built by one of the flows

- femtorv32-quark: XST cannot read it (`ERROR:HDLCompilers:28 - "src/src/femtorv32_quark.v" line 63 'instr' has not been declared`); Silinx reads it.
- itc99-b04, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "data_in<8>" LOC = "C7" ;>`
- itc99-b07, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "punti_retta<8>" LOC = "B6" ;>`
- itc99-b11, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "x_in<6>" LOC = "D6" ;>`
- itc99-b13, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "canale<4>" LOC = "A7" ;>`
- itc99-b14: XST cannot read it (`ERROR:Xst:2587 - Port <addr> of instance <dut> has different type in definition <b14>.`); Silinx reads it.
- itc99-b15: XST cannot read it (`ERROR:Xst:2587 - Port <address> of instance <dut> has different type in definition <b15>.`); Silinx reads it.
- itc99-b17: XST cannot read it (`ERROR:Xst:2587 - Port <address1> of instance <dut> has different type in definition <b17>.`); Silinx reads it.
- itc99-b20, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`
- itc99-b21, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`
- itc99-b22, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`
- nandland-spi-verilog: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/SPI_Master.v" line 60 unexpected token: '$clog2'`); Silinx reads it.
- nandland-spi-vhdl: XST cannot read it (`ERROR:HDLParsers:1401 - "/work/src/src/SPI_Master.vhd" Line 161. Object o_TX_Ready of mode OUT can not be read.`); Silinx reads it.
- neorv32: XST cannot read it (`ERROR:HDLParsers:3317 - "/work/src/src/neorv32_imem.vhd" Line 16. Library neorv32 cannot be found.`); Silinx reads it.
- picorv32: XST cannot read it (`` ERROR:HDLCompilers:26 - "src/src/picorv32.v" line 549 Macro reference `assert is not defined ``); Silinx reads it.
- secworks-aes: XST cannot read it (`ERROR:Xst:1468 - "src/src/aes_key_mem.v" line 180: Unexpected event in always block sensitivity list.`); Silinx reads it.
- secworks-sha1: XST cannot read it (`ERROR:Xst:902 - "src/src/sha1_w_mem.v" line 146: Unexpected w_mem event in always block sensitivity list.`); Silinx reads it.
- secworks-sha256: XST cannot read it (`ERROR:Xst:902 - "src/src/sha256_w_mem.v" line 138: Unexpected w_mem event in always block sensitivity list.`); Silinx reads it.
- serv: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/serv_rf_ram.v" line 12 unexpected token: '$clog2'`); Silinx reads it.
- verilog-axis-fifo: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/axis_fifo.v" line 130 unexpected token: '$clog2'`); Silinx reads it.
- verilog-lfsr-crc: XST cannot read it (`ERROR:Xst:890 - "src/src/lfsr.v" line 271: For statement is only supported when the new step evaluation is based on one the following operator: +, -.`); Silinx reads it.
- verilog-lfsr-prbs: XST cannot read it (`ERROR:Xst:890 - "src/src/lfsr.v" line 235: For statement is only supported when the new step evaluation is based on one the following operator: +, -.`); Silinx reads it.

## Against the best-known results (EPFL benchmarks, LUT-6)

The [EPFL combinational benchmarks](https://github.com/lsils/benchmarks) keep the best results of a logic
synthesis competition, in 6-input LUTs: the fewest LUTs (size) and the fewest levels of LUTs (depth). The
Spartan-3E has 4-input LUTs, so the table above does not compare with them; here Silinx's front end and its
Yosys / ABC mapping (core/synth-open.js) map each benchmark to LUT-6: *area*, ABC's default LUT mapping, against
the size record; *depth*, the logic balanced first as Silinx's depth-oriented mapping does, against the depth
record (geometric means: LUTs 1.82× the size records, levels 1.95× the depth records; the
records come from exact SAT-based resynthesis and long optimization runs, the targets of research, not of a
synthesis tool in seconds). Records: the best_results/README.md of lsils/benchmarks at 82d8cc6.

| benchmark | LUT-6 (area) | levels | best LUTs | LUTs / best | LUT-6 (depth) | levels | best levels | levels / best |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| adder | 273 | 51 | 129 | 2.12 | 332 | 25 | 5 | 5.00 |
| bar | 512 | 4 | 512 | 1.00 | 1664 | 4 | 4 | 1.00 |
| div | not mapped | – | 3082 | – | not mapped | – | 170 | – |
| hyp | not mapped | – | 36451 | – | not mapped | – | 458 | – |
| log2 | 8243 | 66 | 5986 | 1.38 | 8610 | 64 | 51 | 1.25 |
| max | 821 | 33 | 511 | 1.61 | 928 | 18 | 6 | 3.00 |
| multiplier | 5862 | 53 | 4282 | 1.37 | 6357 | 52 | 25 | 2.08 |
| sin | 1466 | 35 | 994 | 1.47 | 1659 | 34 | 10 | 3.40 |
| sqrt | 3869 | 1007 | 2958 | 1.31 | 5032 | 948 | 150 | 6.32 |
| square | 3975 | 50 | 2894 | 1.37 | 4045 | 49 | 10 | 4.90 |
| arbiter | 2722 | 18 | 259 | 10.51 | 1729 | 7 | 5 | 1.40 |
| ctrl | 30 | 2 | 25 | 1.20 | 28 | 2 | 2 | 1.00 |
| cavlc | 136 | 4 | 46 | 2.96 | 143 | 4 | 3 | 1.33 |
| dec | 272 | 2 | 264 | 1.03 | 272 | 2 | 2 | 1.00 |
| i2c | 306 | 3 | 173 | 1.77 | 282 | 4 | 3 | 1.33 |
| int2float | 51 | 3 | 17 | 3.00 | 50 | 3 | 2 | 1.50 |
| mem_ctrl | not mapped | – | 1669 | – | not mapped | – | 5 | – |
| priority | 184 | 26 | 86 | 2.14 | 183 | 12 | 4 | 3.00 |
| router | 46 | 5 | 18 | 2.56 | 44 | 5 | 3 | 1.67 |
| voter | 1625 | 12 | 1145 | 1.42 | 1839 | 12 | 11 | 1.09 |

Measured by `node research/epfl-records/measure.mjs` (research/epfl-records/results.json), by hand when the
synthesis changes.

## How it is measured

`node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>` writes a Silinx
project per design; `node test/designs-corpus/compare-ise.mjs <dir>` builds each with both flows (ISE
from its Docker image, both flows on the same machine) and writes `test/designs-corpus/ise-comparison.json`
and this page. It runs every week on a self-hosted runner with ISE (`.github/workflows/quality.yml`),
which pushes the new results to the branch `quality-results` (merged into main by a maintainer), and
by hand (Actions ▸ Quality ▸ Run workflow). The corpus's nightly
run checks the Silinx toolchain on every design without ISE.
