# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-10-13 (Silinx 15.10.8, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as
tightly as it can (`-c 1`, as Silinx's packer always does) and the clock constraint is tightened to
5 ns, so that its place and route works for speed (ISE stops improving once a constraint
is met; the Silinx toolchain always places and routes for speed).

## Summary

- **Size:** 26 designs built by both. Logic LUTs: Silinx −22% against ISE; flip-flops
  −7%; slices −16% (geometric means of the ratios; below 0: Silinx is smaller). Silinx
  needs as few LUTs or fewer on 18 of 26.
- **Speed:** 23 designs timed by both. Critical path: Silinx +14% against ISE
  (above 0: Silinx is slower); Silinx is as fast or faster on 8 of 23. Both critical
  paths are measured by ISE's timing analyser (trce) on the routed design.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 12 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- The Silinx toolchain is experimental: these numbers are tracked to improve it (the GitHub
  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).

## Size

4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices
after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the
ratio of logic LUTs (below 1: Silinx is smaller).

| design | LUTs Silinx | LUTs ISE | S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 497 | 696 | 0.71 | 386 | 386 | 268 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 1707 | 939 | 1.82 | 272 | 269 | 854 | 534 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 250 | 222 | 1.13 | 0 | – | 160 | 111 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 46 | 48 | 0.96 | 0 | – | 25 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 1.00 | 265 | 265 | 187 | 190 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 446 | 589 | 0.76 | 276 | 270 | 254 | 355 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 81 | 64 | 1.27 | 0 | – | 55 | 32 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1168 | 1386 | 0.84 | 644 | 643 | 645 | 927 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 255 | 417 | 0.61 | 137 | 137 | 144 | 257 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 58 | 125 | 0.46 | 64 | 64 | 38 | 87 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 722 | – | – | 224 | – | 476 | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 512 | 699 | 0.73 | 389 | 389 | 361 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 385 | 539 | 0.71 | 404 | 406 | 261 | 397 | 0 / 0 | 0 / 0 | 4 / 4 |
| light8080 | 343 | 855 | 0.40 | 206 | 237 | 246 | 482 | 0 / 0 | 2 / 1 | 0 / 0 |
| nandland-spi-verilog | 46 | – | – | 37 | – | 52 | – | 0 / – | 0 / – | 0 / – |
| nandland-spi-vhdl | 46 | – | – | 37 | – | 52 | – | 0 / – | 0 / – | 0 / – |
| neorv32 | 2842 | – | – | 1319 | – | 2280 | – | 0 / – | 6 / – | 0 / – |
| picorv32 | 1283 | – | – | 767 | – | 825 | – | 0 / – | 2 / – | 0 / – |
| secworks-aes | 10353 | – | – | 2996 | – | 7662 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha1 | 2234 | – | – | 1560 | – | 1883 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha256 | 3072 | – | – | 1809 | – | 2400 | – | 0 / – | 0 / – | 0 / – |
| secworks-siphash | 1220 | 1180 | 1.03 | 798 | 798 | 1055 | 727 | 0 / 0 | 0 / 0 | 0 / 0 |
| serv | 315 | – | – | 354 | – | 220 | – | 1 / – | 1 / – | 0 / – |
| spi-fpga-master | 27 | 29 | 0.93 | 21 | 21 | 18 | 17 | 0 / 0 | 0 / 0 | 0 / 0 |
| spi-fpga-slave | 21 | 50 | 0.42 | 21 | 20 | 16 | 29 | 0 / 2 | 0 / 0 | 0 / 0 |
| t80 | 2224 | 1874 | 1.19 | 361 | 247 | 1478 | 1000 | 0 / 0 | 0 / 0 | 0 / 0 |
| uart-for-fpga | 56 | 52 | 1.08 | 53 | 52 | 42 | 38 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-axis-fifo | 16 | – | – | 32 | – | 19 | – | 0 / – | 1 / – | 0 / – |
| verilog-i2c-master | 195 | 266 | 0.73 | 72 | 91 | 128 | 145 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-lfsr-crc | 97 | – | – | 64 | – | 52 | – | 0 / – | 0 / – | 0 / – |
| verilog-lfsr-prbs | 16 | – | – | 31 | – | 16 | – | 0 / – | 0 / – | 0 / – |
| verilog-uart | 132 | 160 | 0.82 | 79 | 79 | 131 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-ch-intrinsics | 145 | 154 | 0.94 | 509 | 425 | 281 | 273 | 0 / 1 | 0 / 0 | 0 / 0 |
| vtr-diffeq1 | 409 | 346 | 1.18 | 451 | 451 | 263 | 321 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-diffeq2 | 311 | 312 | 1.00 | 258 | 258 | 161 | 208 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-mkPktMerge | 268 | 4018 | 0.07 | 962 | 8153 | 732 | 5812 | 0 / 153 | 0 / 0 | 0 / 0 |
| vtr-sha | 1610 | 2255 | 0.71 | 893 | 900 | 837 | 1149 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-stereovision3 | 132 | 109 | 1.21 | 120 | 101 | 118 | 92 | 0 / 4 | 0 / 0 | 0 / 0 |

## Speed

The critical path of the routed design (the minimum clock period, or the longest path of a
design without a clock; ns, shorter is faster), both by ISE's trce. *Silinx estimate*: Silinx's own
timing analysis (what its Design Summary shows).

| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate |
|---|---:|---:|---:|---:|
| epfl-adder | 74.55 | 12.25 | 6.09 | 75.87 |
| epfl-bar | 10.35 | 9.08 | 1.14 | 10.31 |
| epfl-dec | 6.25 | 6.12 | 1.02 | 6.29 |
| epfl-i2c | 7.90 | 6.81 | 1.16 | 8.10 |
| epfl-max | 36.88 | 25.68 | 1.44 | 37.31 |
| epfl-priority | 16.27 | 20.83 | 0.78 | 16.48 |
| epfl-router | 9.14 | 9.36 | 0.98 | 9.43 |
| femtorv32-quark | 18.72 | – | – | 18.48 |
| fpu-adder | 11.21 | 12.07 | 0.93 | 11.43 |
| fpu-multiplier | 14.84 | 14.61 | 1.02 | 15.13 |
| light8080 | 11.85 | 15.13 | 0.78 | 12.25 |
| nandland-spi-verilog | 5.69 | – | – | 5.51 |
| nandland-spi-vhdl | 5.28 | – | – | 5.23 |
| neorv32 | 16.74 | – | – | 16.17 |
| picorv32 | 12.29 | – | – | 12.41 |
| secworks-aes | 28.08 | – | – | 27.69 |
| secworks-sha1 | 16.88 | – | – | 16.79 |
| secworks-sha256 | 26.86 | – | – | 26.63 |
| secworks-siphash | 15.63 | 13.98 | 1.12 | 15.88 |
| serv | 13.44 | – | – | 13.56 |
| spi-fpga-master | 4.72 | 4.99 | 0.95 | 4.85 |
| spi-fpga-slave | 5.36 | 4.94 | 1.08 | 5.30 |
| t80 | 23.81 | 18.13 | 1.31 | 23.93 |
| uart-for-fpga | 4.80 | 4.69 | 1.02 | 4.54 |
| verilog-axis-fifo | 5.78 | – | – | 5.54 |
| verilog-i2c-master | 10.94 | 9.88 | 1.11 | 10.88 |
| verilog-lfsr-crc | 3.89 | – | – | 3.96 |
| verilog-lfsr-prbs | 2.27 | – | – | 2.29 |
| verilog-uart | 10.18 | 9.24 | 1.10 | 10.33 |
| vtr-ch-intrinsics | 7.57 | 5.06 | 1.50 | 7.77 |
| vtr-diffeq1 | 35.73 | 35.80 | 1.00 | 39.35 |
| vtr-diffeq2 | 31.76 | 26.74 | 1.19 | 32.99 |
| vtr-mkPktMerge | 7.15 | 9.27 | 0.77 | 7.42 |
| vtr-sha | 15.97 | 19.92 | 0.80 | 16.02 |
| vtr-stereovision3 | 7.68 | 4.92 | 1.56 | 7.79 |

## Not built by one of the flows

- femtorv32-quark: XST cannot read it (`ERROR:HDLCompilers:28 - "src/src/femtorv32_quark.v" line 63 'instr' has not been declared`); Silinx reads it.
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

## How it is measured

`node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>` writes a Silinx
project per design; `node test/designs-corpus/compare-ise.mjs <dir>` builds each with both flows (ISE
from its Docker image, both flows on the same machine) and writes `test/designs-corpus/ise-comparison.json`
and this page. It runs every week on a self-hosted runner with ISE (`.github/workflows/quality.yml`),
which commits the new results, and by hand (Actions ▸ Quality ▸ Run workflow). The corpus's nightly
run checks the Silinx toolchain on every design without ISE.
