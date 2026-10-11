# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-10-11 (Silinx 15.10.1, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as
tightly as it can (`-c 1`, as Silinx's packer always does) and the clock constraint is tightened to
5 ns, so that its place and route works for speed (ISE stops improving once a constraint
is met; the Silinx toolchain always places and routes for speed).

## Summary

- **Size:** 22 designs built by both. Logic LUTs: Silinx −23% against ISE; flip-flops
  −6%; slices −18% (geometric means of the ratios; below 0: Silinx is smaller). Silinx
  needs as few LUTs or fewer on 16 of 22.
- **Speed:** 20 designs timed by both. Critical path: Silinx +15% against ISE
  (above 0: Silinx is slower); Silinx is as fast or faster on 5 of 20. Both critical
  paths are measured by ISE's timing analyser (trce) on the routed design.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 11 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- The Silinx toolchain is experimental: these numbers are tracked to improve it (the GitHub
  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).

## Size

4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices
after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the
ratio of logic LUTs (below 1: Silinx is smaller).

| design | LUTs Silinx | LUTs ISE | S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 477 | 696 | 0.69 | 386 | 386 | 264 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 1709 | 939 | 1.82 | 264 | 269 | 855 | 534 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 256 | – | – | 0 | – | 160 | – | 0 / – | 0 / – | 0 / – |
| epfl-ctrl | 46 | – | – | 0 | – | 25 | – | 0 / – | 0 / – | 0 / – |
| epfl-dec | 373 | 373 | 1.00 | 265 | 265 | 187 | 190 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 452 | 589 | 0.77 | 276 | 270 | 255 | 355 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 80 | – | – | 0 | – | 57 | – | 0 / – | 0 / – | 0 / – |
| epfl-max | 1090 | 1386 | 0.79 | 643 | 643 | 610 | 927 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 261 | 417 | 0.63 | 137 | 137 | 162 | 257 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 63 | 125 | 0.50 | 64 | 64 | 39 | 87 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 721 | – | – | 224 | – | 536 | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 522 | 699 | 0.75 | 389 | 389 | 375 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 381 | 539 | 0.71 | 404 | 406 | 255 | 397 | 0 / 0 | 0 / 0 | 4 / 4 |
| nandland-spi-verilog | 46 | – | – | 37 | – | 52 | – | 0 / – | 0 / – | 0 / – |
| nandland-spi-vhdl | 74 | – | – | 39 | – | 88 | – | 0 / – | 0 / – | 0 / – |
| picorv32 | 1274 | – | – | 767 | – | 823 | – | 0 / – | 2 / – | 0 / – |
| secworks-aes | 10353 | – | – | 2996 | – | 7662 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha1 | 2234 | – | – | 1528 | – | 1883 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha256 | 3072 | – | – | 1809 | – | 2400 | – | 0 / – | 0 / – | 0 / – |
| secworks-siphash | 1220 | 1180 | 1.03 | 798 | 798 | 1055 | 727 | 0 / 0 | 0 / 0 | 0 / 0 |
| serv | 319 | – | – | 354 | – | 215 | – | 1 / – | 1 / – | 0 / – |
| spi-fpga-master | 27 | 29 | 0.93 | 23 | 21 | 19 | 17 | 0 / 0 | 0 / 0 | 0 / 0 |
| spi-fpga-slave | 21 | 50 | 0.42 | 21 | 20 | 16 | 29 | 0 / 2 | 0 / 0 | 0 / 0 |
| t80 | 2288 | 1874 | 1.22 | 361 | 247 | 1539 | 1000 | 0 / 0 | 0 / 0 | 0 / 0 |
| uart-for-fpga | 56 | 52 | 1.08 | 58 | 52 | 43 | 38 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-axis-fifo | 16 | – | – | 32 | – | 19 | – | 0 / – | 1 / – | 0 / – |
| verilog-i2c-master | 198 | 266 | 0.74 | 72 | 91 | 135 | 145 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-lfsr-crc | 103 | – | – | 64 | – | 55 | – | 0 / – | 0 / – | 0 / – |
| verilog-lfsr-prbs | 16 | – | – | 31 | – | 16 | – | 0 / – | 0 / – | 0 / – |
| verilog-uart | 132 | 160 | 0.82 | 79 | 79 | 131 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-ch-intrinsics | 145 | 154 | 0.94 | 509 | 425 | 281 | 273 | 0 / 1 | 0 / 0 | 0 / 0 |
| vtr-diffeq1 | 409 | 346 | 1.18 | 451 | 451 | 263 | 321 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-diffeq2 | 311 | 312 | 1.00 | 258 | 258 | 161 | 208 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-mkPktMerge | 267 | 4018 | 0.07 | 962 | 8153 | 733 | 5812 | 0 / 153 | 0 / 0 | 0 / 0 |
| vtr-sha | 1610 | 2255 | 0.71 | 893 | 900 | 837 | 1149 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-stereovision3 | 140 | 109 | 1.28 | 120 | 101 | 118 | 92 | 0 / 4 | 0 / 0 | 0 / 0 |

## Speed

The critical path of the routed design (the minimum clock period, or the longest path of a
design without a clock; ns, shorter is faster), both by ISE's trce. *Silinx estimate*: Silinx's own
timing analysis (what its Design Summary shows).

| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate |
|---|---:|---:|---:|---:|
| epfl-adder | – | 12.25 | – | – |
| epfl-bar | 11.13 | 9.08 | 1.23 | 11.11 |
| epfl-dec | 6.23 | 6.12 | 1.02 | 6.18 |
| epfl-i2c | 6.82 | 6.81 | 1.00 | 6.93 |
| epfl-max | 69.86 | 25.68 | 2.72 | 71.00 |
| epfl-priority | – | 20.83 | – | – |
| epfl-router | 9.87 | 9.36 | 1.06 | 10.19 |
| femtorv32-quark | 19.22 | – | – | 18.96 |
| fpu-adder | 11.51 | 12.07 | 0.95 | 11.48 |
| fpu-multiplier | 16.42 | 14.61 | 1.12 | 15.98 |
| nandland-spi-verilog | 5.30 | – | – | 5.24 |
| nandland-spi-vhdl | 11.12 | – | – | 11.06 |
| picorv32 | 13.79 | – | – | 12.44 |
| secworks-aes | 27.57 | – | – | 27.51 |
| secworks-sha1 | 17.18 | – | – | 17.40 |
| secworks-sha256 | 26.15 | – | – | 25.89 |
| secworks-siphash | 15.68 | 13.98 | 1.12 | 15.52 |
| serv | 13.48 | – | – | 13.63 |
| spi-fpga-master | 4.39 | 4.99 | 0.88 | 4.41 |
| spi-fpga-slave | 5.36 | 4.94 | 1.08 | 5.30 |
| t80 | 22.97 | 18.13 | 1.27 | 23.41 |
| uart-for-fpga | 4.41 | 4.69 | 0.94 | 4.44 |
| verilog-axis-fifo | 5.67 | – | – | 5.47 |
| verilog-i2c-master | 11.22 | 9.88 | 1.14 | 11.29 |
| verilog-lfsr-crc | 4.10 | – | – | 4.00 |
| verilog-lfsr-prbs | 2.35 | – | – | 2.28 |
| verilog-uart | 11.89 | 9.24 | 1.29 | 6.65 |
| vtr-ch-intrinsics | 6.76 | 5.06 | 1.34 | 6.83 |
| vtr-diffeq1 | 38.06 | 35.80 | 1.06 | 42.63 |
| vtr-diffeq2 | 30.74 | 26.74 | 1.15 | 33.14 |
| vtr-mkPktMerge | 8.22 | 9.27 | 0.89 | 8.02 |
| vtr-sha | 16.86 | 19.92 | 0.85 | 16.59 |
| vtr-stereovision3 | 8.60 | 4.92 | 1.75 | 8.46 |

## Not built by one of the flows

- epfl-adder, Silinx: `ERROR:Silinx - 4 net(s) cannot be routed on the routing switches whose bits are known (the bit database does not know every switch of the device yet)`
- epfl-cavlc, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "totalcoeffs[0]" LOC = "C3" ;>`
- epfl-ctrl, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "opcode[0]" LOC = "C3" ;>`
- epfl-int2float, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "B[0]" LOC = "C3" ;> [top.ucf(1)]:`
- epfl-priority, Silinx: `ERROR:Silinx - 1 net(s) cannot be routed on the routing switches whose bits are known (the bit database does not know every switch of the device yet)`
- femtorv32-quark: XST cannot read it (`ERROR:HDLCompilers:28 - "src/src/femtorv32_quark.v" line 63 'instr' has not been declared`); Silinx reads it.
- nandland-spi-verilog: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/SPI_Master.v" line 60 unexpected token: '$clog2'`); Silinx reads it.
- nandland-spi-vhdl: XST cannot read it (`ERROR:HDLParsers:1401 - "/work/src/src/SPI_Master.vhd" Line 161. Object o_TX_Ready of mode OUT can not be read.`); Silinx reads it.
- picorv32: XST cannot read it (`` ERROR:HDLCompilers:26 - "src/src/picorv32.v" line 549 Macro reference `assert is not defined ``); Silinx reads it.
- secworks-aes: XST cannot read it (`ERROR:Xst:1468 - "src/src/aes_key_mem.v" line 180: Unexpected event in always block sensitivity list.`); Silinx reads it.
- secworks-sha1: XST cannot read it (`ERROR:Xst:902 - "src/src/sha1_w_mem.v" line 146: Unexpected w_mem event in always block sensitivity list.`); Silinx reads it.
- secworks-sha256: XST cannot read it (`ERROR:Xst:902 - "src/src/sha256_w_mem.v" line 138: Unexpected w_mem event in always block sensitivity list.`); Silinx reads it.
- serv: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/serv_rf_ram.v" line 12 unexpected token: '$clog2'`); Silinx reads it.
- verilog-axis-fifo: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/axis_fifo.v" line 130 unexpected token: '$clog2'`); Silinx reads it.
- verilog-lfsr-crc: XST cannot read it (`ERROR:Xst:890 - "src/src/lfsr.v" line 271: For statement is only supported when the new step evaluation is based on one the following operator: +, -.`); Silinx reads it.
- verilog-lfsr-prbs: XST cannot read it (`ERROR:Xst:890 - "src/src/lfsr.v" line 235: For statement is only supported when the new step evaluation is based on one the following operator: +, -.`); Silinx reads it.
- neorv32, light8080: Silinx cannot read or synthesize them yet (the design corpus's [results](../test/designs-corpus/README.md)), so neither flow was compared.

## How it is measured

`node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>` writes a Silinx
project per design; `node test/designs-corpus/compare-ise.mjs <dir>` builds each with both flows (ISE
through Silinx's SSH mode, on a machine with ISE) and writes `test/designs-corpus/ise-comparison.json`
and this page. The corpus's nightly run checks the Silinx toolchain on every design without ISE; this
comparison is run by hand, as it needs ISE.
