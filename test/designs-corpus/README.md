# Design corpus: real open-source designs through the whole toolchain

The other tests check Silinx on its own examples and on small test designs. This corpus takes
**real open-source designs** — CPUs, peripherals, cryptographic cores, benchmark suites, in
Verilog and VHDL — through every stage of Silinx's toolchain, and records what each stage does
with them, how long it takes and which warnings it gives.

    npm run test:designs                 # all designs (about 10 minutes with 6 jobs)
    npm run test:designs -- --filter serv,epfl --jobs 4
    npm run test:designs -- --update     # record the results as the expectations

Not part of `npm test` (it needs the network once, and minutes).

## The designs: fetched, never committed

`manifest.json` lists each design: its repository and **pinned commit**, its licence, language,
top, files, clock / reset, generics, its own self-checking testbench when it has one, and its
expected size (the part it fits). `scripts/fetch-design-corpus.mjs` (`npm run fetch:designs`)
downloads exactly those files (and each repository's licence) from
`raw.githubusercontent.com/<repo>/<commit>/…` into `.cache/designs-corpus/` (git-ignored). No
third-party design file is in the repository; the files under `wrappers/` and `boards/` are
Silinx's own (AGPL-3.0-only).

Only designs under an open-source licence (permissive or copyleft) are used; `validateManifest`
refuses a source without one, or not pinned to a commit.

| source | designs | licence | language |
| --- | --- | --- | --- |
| [olofk/serv](https://github.com/olofk/serv) | SERV (bit-serial RV32I) | ISC | Verilog |
| [YosysHQ/picorv32](https://github.com/YosysHQ/picorv32) | PicoRV32 (small configuration) | ISC | Verilog |
| [BrunoLevy/learn-fpga](https://github.com/BrunoLevy/learn-fpga) | FemtoRV32 Quark | BSD-3-Clause | Verilog |
| [stnolting/neorv32](https://github.com/stnolting/neorv32) | NEORV32 (approm test setup) | BSD-3-Clause | VHDL-2008 |
| [jaruiz/light8080](https://github.com/jaruiz/light8080) | light8080 + mcu80 SoC, 'hello' program, testbench | LGPL-2.1 | VHDL |
| [freecores/t80](https://github.com/freecores/t80) | T80 (Z80), T80s top | BSD-3-Clause-style (in the sources) | VHDL |
| [alexforencich/verilog-uart](https://github.com/alexforencich/verilog-uart), [-i2c](https://github.com/alexforencich/verilog-i2c), [-lfsr](https://github.com/alexforencich/verilog-lfsr), [-axis](https://github.com/alexforencich/verilog-axis) | UART, I2C master, CRC-32, PRBS31, AXI-stream FIFO | MIT | Verilog |
| [jakubcabal/uart-for-fpga](https://github.com/jakubcabal/uart-for-fpga), [spi-fpga](https://github.com/jakubcabal/spi-fpga) | UART, SPI master, SPI slave, with self-checking testbenches | MIT | VHDL |
| [nandland/spi-master](https://github.com/nandland/spi-master) | SPI master, in Verilog and in VHDL | MIT | both |
| [secworks](https://github.com/secworks) aes, sha1, sha256, siphash | crypto cores with self-checking testbenches | BSD-2-Clause | Verilog |
| [dawsonjon/fpu](https://github.com/dawsonjon/fpu) | IEEE 754 adder, multiplier | MIT | Verilog |
| [VTR benchmarks](https://github.com/verilog-to-routing/vtr-verilog-to-routing) | sha, diffeq1, diffeq2, ch_intrinsics, stereovision3, mkPktMerge | open source, each under the terms in its own source (VTR's LICENSE.md); sha: OpenCores BSD-style | Verilog |
| [EPFL combinational suite](https://github.com/lsils/benchmarks) | ctrl, int2float, cavlc, router, priority, dec, i2c, adder, bar, max | MIT | Verilog (gates) |

The VTR benchmarks (sha, diffeq1, diffeq2, ch_intrinsics, stereovision3, mkPktMerge) carry no licence
of their own beyond VTR's LICENSE.md; the author decided (2026-10-11) to keep them in the corpus on
the condition that they are only downloaded for testing (scripts/fetch-design-corpus.mjs) and never
committed or redistributed with Silinx, as every design of the corpus.

Not included: ISCAS'85 / '89 (no repository with a licence found), the GHDL test suite (optional,
later), the larger VTR and EPFL designs (too large for the XC3S250E: kept for the XC3S500E /
1200E when their bit databases exist), Plasma (licence unclear).

`wrappers/` holds Silinx's own glue: `mcu80_hello.vhd` (light8080's SoC with its 'hello' program
as a top without an array generic) and `vtr_memories.v` (behavioural models of VTR's
`single_port_ram` / `dual_port_ram` hard blocks).

## The stages (`run.mjs`)

Each design runs in a worker thread; each stage records a status, its time and its warnings.

| stage | what | status |
| --- | --- | --- |
| `frontend` | Silinx parses and elaborates the design, then runs its design checks (lint) as *Check Syntax* does | `pass`, `unsupported: parse/elaborate: <first error>` (the full list in the results) |
| `tb` | the design's own self-checking testbench in Silinx's simulator, until it prints its pass (or fail) message | `pass`, `fail: <line>`, `unsupported: …`, `skip: no self-checking testbench` |
| `synth` | the open synthesis: Silinx's synthesis front end (`core/synth-verilog.js`) + Yosys (YoWASP) | `pass`, `unsupported: <construct>`, `error: <Yosys error>` |
| `diff` | the netlist simulated against the RTL cycle by cycle, seeded random stimulus (`test/diff-synth.js`) | `pass`, `mismatch: cycle N: <outputs>` (the report in the results) |
| `flow` | the open back end on the XC3S250E (Basys2-250): pack, place, route on the PIPs of known bits, static timing against PERIOD 20 ns, bitgen | `complete` (every feature in the bit database), `too large: …`, `fail: route/bitgen: …`, `unsupported: …` |

For the flow, the clock goes on the Basys2's oscillator pin (B8, `boardClockUcf`). A design with
more port bits than the package has pins (92) is wrapped (`lib.mjs ioWrapper`): its inputs are
loaded serially from one pin by a shift register, its outputs registered and XOR-reduced to one
pin, so nothing is optimised away — the back end is tested on the real logic, the behaviour was
checked before on the design's own ports (`diff`). Cells the packer does not support yet (block
and distributed RAM, shift registers, multipliers) are recorded as a warning and the design is
synthesized again with `-nobram -nolutram -nosrl -nodsp` so the rest of the flow is still tested.

### Expectations and warnings

`expected.json` holds, per design, the status of every stage and **every warning of every
stage** (normalized: no absolute paths, no Yosys-generated numbers, repeats counted as `(xN)`):
Silinx's own (`WARNING:Silinx - …`, the design checks `WARNING:Silinx:646 (unused-signal) - …`,
the simulator's, the flow's `WARNING:Silinx (pack|timing) - …`) and Yosys's (`Warning: …`). A run
**fails** on a regression (a stage expected `pass` / `complete` that is not), on a **new warning**
and on a **warning that vanished**; newly passing stages and other changes are listed. `--update`
records the run. `--stages frontend,tb` runs (and compares) only those stages. The full results
(times, cell counts, slices, timing per clock, mismatch reports, unreached nets) are written to
`.cache/designs-corpus/results.json`.

## Results (2026-10-11, Yosys 0.68 / YoWASP, XC3S250E-4CP132)

`(w)`: through the I/O wrapper; `(r)`: synthesized again without RAM / SRL / multiplier cells for
the packer. Slices and period: the flow's (the period by Silinx's STA, against 20 ns). Times: all
stages, seconds, on an Apple-silicon Mac, 6 jobs.

| design | lang | licence | LUT4 / FF (Yosys) | frontend | tb | synth | diff | flow (XC3S250E) | slices | period (ns) | warnings | time (s) |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| serv | Verilog | ISC | 351 / 182 | pass | - | pass | pass | complete (w) (r) | 1492 | 18.136 | 17 (frontend 12, synth 4, flow 1) | 235 |
| picorv32 | Verilog | ISC | 1292 / 463 | pass | - | pass | pass | too large (w) (r) | 3090 |  | 47 (frontend 28, synth 18, flow 1) | 32 |
| femtorv32-quark | Verilog | BSD-3-Clause | 815 / 127 | pass | - | pass | pass | complete (w) (r) | 1486 | 20.949 | 15 (synth 13, flow 2) | 296 |
| neorv32 | VHDL | BSD-3-Clause |  | pass | - | unsupported | - | - |  |  | 40 (frontend 40) | 0.3 |
| light8080 | VHDL | LGPL-2.1 |  | unsupported | unsupported | - | - | - |  |  | 0 | 0.0 |
| t80 | VHDL | BSD-3-Clause-style | 2860 / 361 | pass | - | pass | pass | too large | 2616 |  | 6 (frontend 5, synth 1) | 16 |
| verilog-uart | Verilog | MIT | 131 / 79 | pass | - | pass | pass | complete | 131 | 6.053 | 1 (synth 1) | 7 |
| verilog-i2c-master | Verilog | MIT | 203 / 72 | pass | - | pass | pass | complete | 204 | 13.767 | 5 (frontend 4, synth 1) | 8 |
| verilog-lfsr-crc | Verilog | MIT | 103 / 64 | pass | - | pass | pass | complete | 55 | 4.732 | 161 (synth 161) | 121 |
| verilog-lfsr-prbs | Verilog | MIT | 16 / 31 | pass | - | pass | pass | complete | 16 | 3.031 | 158 (frontend 1, synth 157) | 96 |
| verilog-axis-fifo | Verilog | MIT | 16 / 32 | pass | - | pass | pass | complete (r) | 814 | 10.763 | 14 (frontend 5, synth 8, flow 1) | 33 |
| uart-for-fpga | VHDL | MIT | 55 / 58 | pass | pass | pass | pass | complete | 45 | 4.992 | 2 (frontend 1, synth 1) | 56 |
| spi-fpga-master | VHDL | MIT | 27 / 23 | pass | pass | pass | pass | complete | 19 | 4.921 | 2 (frontend 1, synth 1) | 4 |
| spi-fpga-slave | VHDL | MIT | 89 / 21 | pass | pass | pass | pass | complete | 87 | 5.067 | 1 (synth 1) | 6 |
| nandland-spi-verilog | Verilog | MIT | 45 / 37 | pass | - | pass | pass | complete | 54 | 6.178 | 2 (frontend 1, synth 1) | 3 |
| nandland-spi-vhdl | VHDL | MIT | 73 / 37 | pass | - | pass | pass | complete | 131 | 12.542 | 3 (frontend 2, synth 1) | 4 |
| secworks-sha1 | Verilog | BSD-2-Clause | 2660 / 850 | pass | unsupported | pass | pass | too large (w) | 3437 |  | 3 (frontend 1, synth 2) | 24 |
| secworks-sha256 | Verilog | BSD-2-Clause | 3537 / 1034 | pass | pass | pass | pass | too large (w) | 3437 |  | 3 (frontend 1, synth 2) | 35 |
| secworks-siphash | Verilog | BSD-2-Clause | 1231 / 462 | pass | pass | pass | pass | complete (w) | 1263 | 17.885 | 1 (synth 1) | 145 |
| secworks-aes | Verilog | BSD-2-Clause | 11251 / 2476 | pass | unsupported | pass | pass | too large (w) | 13078 |  | 4 (synth 4) | 418 |
| fpu-adder | Verilog | MIT | 471 / 285 | pass | - | pass | pass | fail (w) | 367 | 12.713 | 1 (synth 1) | 19 |
| fpu-multiplier | Verilog | MIT | 549 / 300 | pass | - | pass | pass | too large (w) (r) | 2568 |  | 2 (synth 1, flow 1) | 24 |
| vtr-sha | Verilog | BSD-style | 2211 / 893 | pass | - | pass | pass | complete | 1145 | 17.546 | 1 (synth 1) | 82 |
| vtr-diffeq1 | Verilog | VTR (open) | 587 / 193 | pass | - | pass | pass | too large (w) (r) | 5869 |  | 2 (synth 1, flow 1) | 74 |
| vtr-diffeq2 | Verilog | VTR (open) | 488 / 96 | pass | - | pass | pass | too large (w) (r) | 5825 |  | 2 (synth 1, flow 1) | 87 |
| vtr-ch-intrinsics | Verilog | VTR (open) | 104 / 219 | pass | - | pass | mismatch | complete (w) (r) | 525 | 9.25 | 23 (frontend 13, synth 9, flow 1) | 24 |
| vtr-stereovision3 | Verilog | VTR (open) | 111 / 120 | pass | - | pass | pass | fail | 153 |  | 4 (frontend 2, synth 2) | 7 |
| vtr-mkPktMerge | Verilog | VTR (open) | 242 / 495 | pass | - | pass | pass | too large (w) (r) | 5982 |  | 35 (frontend 33, synth 1, flow 1) | 68 |
| epfl-ctrl | Verilog | MIT | 40 / 0 | pass | - | pass | pass | complete | 34 |  | 1 (synth 1) | 4 |
| epfl-int2float | Verilog | MIT | 99 / 0 | pass | - | pass | pass | complete | 63 |  | 1 (synth 1) | 5 |
| epfl-cavlc | Verilog | MIT | 191 / 0 | pass | - | pass | pass | complete | 119 |  | 1 (synth 1) | 8 |
| epfl-router | Verilog | MIT | 58 / 0 | pass | - | pass | pass | complete (w) | 95 | 11.669 | 1 (synth 1) | 8 |
| epfl-priority | Verilog | MIT | 280 / 0 | pass | - | pass | pass | complete (w) | 303 | 45.573 | 2 (synth 1, flow 1) | 23 |
| epfl-dec | Verilog | MIT | 256 / 0 | pass | - | pass | pass | complete (w) | 433 | 10.251 | 1 (synth 1) | 25 |
| epfl-i2c | Verilog | MIT | 452 / 0 | pass | - | pass | pass | complete (w) | 381 | 9.648 | 1 (synth 1) | 22 |
| epfl-adder | Verilog | MIT | 709 / 0 | pass | - | pass | pass | complete (w) | 515 | 97.621 | 2 (synth 1, flow 1) | 22 |
| epfl-bar | Verilog | MIT | 2820 / 0 | pass | - | pass | pass | too large (w) | 2456 |  | 1 (synth 1) | 19 |
| epfl-max | Verilog | MIT | 1746 / 0 | pass | - | pass | pass | complete (w) | 881 | 81.233 | 2 (synth 1, flow 1) | 45 |

Summary: 38 designs; front end 37 / 38; own testbenches 5 / 8 pass; synthesis 36; netlist =
RTL 35 (1 mismatch, open below); fully open bitstream complete on the XC3S250E for 24 designs
(10 of them through the I/O wrapper), 10 too large for it, 2 fail (a bit-database gap, a
second clock).

The epfl-priority / adder / max periods are those of the I/O wrapper around a combinational
design (the whole logic between two registers): the PERIOD warning is expected there.

### Checked against ISE

`SILINX_ISE_HOST=… node scripts/check-open-flow.mjs <projects>` (one ISE job, an Intel Mac mini
with ISE 14.7 in Docker): ISE converts each routed XDL, runs its DRC and bitgen; Silinx's .bit
must be byte-identical (CRC on and off). `run.mjs --projects dir` writes a Silinx project for each
design whose flow completed (the I/O wrapper and a wrapper setting the generics included);
`boards.mjs` the board versions below (a design synthesized again for the packer: its
`netlist.json`, given with `--json`).

Result (2026-10-11, the 24 corpus designs whose flow completes and the 4 board designs, one ISE
job): **every design passes ISE's DRC (0 errors, 0 warnings); 25 of 28 bitstreams are
byte-identical to ISE's bitgen** (CRC on and off), the 4 board bitstreams among them. The 3 others
(verilog-lfsr-prbs: 1 frame bit, spi-fpga-master: 6, verilog-axis-fifo: 57) differ only in the
tiles of **input pads whose input drives nothing** (ports the design declares but does not use:
`pause_req`, `s_axis_tid`…) and, for the FIFO, one left I/O tile's switches (`W6END6->E2BEG6`,
`LH6->E6BEG0`): bit-database cases, listed below. Before the placer's VCCO fix, 4 designs
(verilog-i2c-master, uart-for-fpga, spi-fpga-slave, verilog-lfsr-crc) failed ISE's DRC
(PhysDesignRules:755). ISE's trce agrees with Silinx's STA within about 5% (vtr-sha 17.82 vs
17.55 ns, siphash 18.00 vs 17.89, i2c-master 13.24 vs 13.77, the SERV board 16.97 vs 16.15).

## Board versions (Basys2-250): `boards.mjs`

    node test/designs-corpus/boards.mjs <projects dir> <bit dir>

Our own top around a fetched design (`boards/*.v`), the Basys2's pins (`server/devices.js`), the
board design's own testbench in Silinx's simulator when it has one, and the fully open flow
(`research/s3e-route/open-flow.mjs`) to `<bit dir>/<name>.bit`.

| bitstream | design | on the board |
| --- | --- | --- |
| `corpus-serv.bit` | SERV (RISC-V) running an 8-instruction program from a ROM (`boards/serv_basys2.v`, testbench `serv_basys2_tb.v`) | LD7..LD0 count in binary, about one step a second; BTN0 held: reset, the count starts again from 1 |
| `corpus-prbs.bit` | verilog-lfsr PRBS31 generator | LD7..LD0: a new pseudo-random pattern about 3 times a second; SW0 freezes it; BTN0 restarts the sequence |
| `corpus-spi.bit` | nandland SPI master, MISO looped to MOSI | press BTN1: the switches' byte goes out and comes back; LD7..LD0 show it; BTN0: reset |
| `corpus-int2float.bit` | EPFL int2float | the integer {BTN2..0, SW7..0} as a float: LD3..0 mantissa, LD6..4 exponent, LD7 on |

## Bugs found and fixed (with a regression test in `test/designs-corpus-fixes.test.js`)

- **Open synthesis: a memory declared inside a function lost its words** (written as one vector):
  verilog-lfsr's `lfsr_mask` made the CRC-32 and the PRBS generator constant in the netlist
  (`core/synth-verilog.js`).
- **Verilog `?:` of strings** (`parameter S = (STYLE == "AUTO") ? "REDUCTION" : STYLE`) crashed
  elaboration ("Cannot read properties of undefined") in a generate condition (`core/interp.js`).
- **`$display("%02d")` padded with blanks** instead of zeros: secworks' testbenches print
  "All 03 test cases" and were judged failing (`core/interp.js`).
- **"function assigns signal" warned for Verilog tasks and VHDL procedures**, which may assign the
  signals they see (secworks testbenches: dozens of spurious warnings) (`core/elaborate.js`).
- **`ieee.math_real`** was missing: `ceil`, `floor`, `round`, `trunc`, `sqrt`, `log2`, `log10`,
  `log`, `exp`, `sign`, `realmax`, `realmin`, the `MATH_*` constants and the `UNIFORM` procedure
  (jakubcabal's UART / SPI and their testbenches) (`core/elaborate.js`, `core/interp.js`,
  `core/vhdl/math-real.js`, `core/vhdl/parser.js`, `core/compile.js`).
- **VHDL aggregates as port and generic actuals** (`DIN_ADDR => (others => '0')`,
  `DEV_01_BASE => (others => '0')`): "cannot determine the type of the aggregate"
  (`core/elaborate.js`).
- **VHDL `boolean(…)`** conversion and **generics of an unconstrained array type** (NEORV32,
  light8080) (`core/elaborate.js`).
- **Open synthesis: a for loop in an instance's process was dropped by Yosys**: the loop variable
  was written as an escaped name with a dot (`for (\u.j = 3; …)`), which Yosys 0.68 does not
  unroll: verilog-axis's FIFO inside another module (the I/O wrapper) lost its pipeline and its
  block RAM (`core/synth-verilog.js`: loop variables get a plain name).
- **Placer: I/O banks mixed voltages**: a 3.3 V clock on B8 and unconstrained (LVCMOS25) outputs in
  the same bank gave bitstreams ISE's DRC refuses (PhysDesignRules:755, "VCCO incompatible"); the
  placer now keeps one VCCO per bank and refuses fixed I/Os that mix them (`core/fpga/place.js`).
- **RAMB16 model**: port B reading the word port A writes at the same edge got the new word; the
  reads of both ports now come before the writes (old word, as Yosys's READ_FIRST mapping
  expects) (`core/unisim.js`; verilog-axis FIFO `diff`).
- **Design checks: `$clog2` warned at line 1** when it was in a declaration's or a parameter's
  range (serv, verilog-axis, nandland SPI); the checks without an XST number were labelled `Lint`,
  not `Silinx` (#16; `core/elaborate.js`, `core/verilog/parser.js`, `core/lint.js`; test in
  `test/lint.test.js`).
- Differential test: a block RAM never written gets `INIT_xx`, `INIT_A/B`, `SRVAL_A/B` = x from
  Yosys; 0 in the bitstream, so 0 in the netlist simulation (`test/diff-synth.js`).

## Open (with reproducers)

Front end (Verilog / VHDL):
- light8080: **slices of arrays** (`br(obj_size to size-1) := (others => x"00")` on an array of
  vectors): "array slices are not supported".
- secworks sha1 testbench: **hierarchical reference into a named block** (`dut.state_logic.f`);
  aes testbench: **a reference through the top's own name** (`tb_aes_core.dut.…`).

Open synthesis (`core/synth-verilog.js`, Yosys):
- NEORV32: "assignment of an array to a part of an array (line 544)" (unsupported).
- **Constant function calls are not folded**: verilog-lfsr's `wire mask = lfsr_mask(n)` (constant
  per generate iteration) is written as a call; Yosys evaluates the function per wire (110-150 s
  of synthesis) and warns "Replacing memory … with list of registers" ~160 times (spurious).
- **VHDL signals assigned a constant** (`w_CPOL <= '1' when SPI_MODE = 2 else '0'`) used as an
  asynchronous reset value: the netlist gets async-load flip-flop emulation. nandland's SPI master:
  258 LUTs in VHDL, 105 in Verilog for the same design, 12.5 ns vs 6.2 ns.
- Yosys's "Shift register inference not yet supported for family xc3se." on every design
  (spurious: `synth_xilinx -family xc3se` without `-nosrl`).
- Size: T80 2860 LUT4 + 3083 MUXF (ISE ~1.5k LUT for this core); secworks sha1 2660 LUT4 alone but
  6477 inside the I/O wrapper.

Differential test harness:
- vtr-ch-intrinsics: at power-up the RTL's `case` of an X state takes the `default` (X-optimism)
  while the netlist's register starts at 0 (`memory_controller_write_enable`).

Back end (`core/fpga`, bit database):
- **Unused inputs**: a port that is an input of the design but drives nothing (an IOB with its
  input buffer and no load): Silinx's bitgen sets bits that ISE's bitgen clears
  (in the unused pads' tiles and in the clock pad B8's tile) (`IOB:IMUX:1`, `IDELMUX:1`…: 6 to 30 frame bits; corpus-spi /
  corpus-prbs / corpus-serv with BTN1..3, SW1..7 declared but unused; verilog-lfsr-prbs, spi-fpga-master,
  verilog-axis-fifo in the corpus), and a left I/O tile's `W6END6->E2BEG6` / `LH6->E6BEG0`
  (verilog-axis-fifo). The board tops declare only
  the pins they use; the bit database needs the case measured.
- fpu-adder: bitgen: `SLICE0:C2VDD:` / `SLICE1:C2VDD:` (a carry chain whose first input is VCC)
  are not in the bit database.
- vtr-stereovision3: a **second clock from a pad** cannot reach a BUFGMUX on known PIPs (the
  BUFGMUX inputs of 7 of the 8 are not measured), and the placer puts an unconstrained clock on any
  pad.
- The packer does not support block RAM, distributed RAM, SRL16 or MULT18X18 yet: every CPU and
  FIFO is retried without them (much larger: SERV's register file in flip-flops, 1492 slices).

## Nightly CI (suggested)

    - uses: actions/cache@v4   (path: .cache/designs-corpus, key: hashFiles('test/designs-corpus/manifest.json'))
    - run: npm ci
    - run: node scripts/fetch-design-corpus.mjs
    - run: npm run test:designs -- --jobs 2        (about 30 minutes on 2 cores)
    - upload .cache/designs-corpus/results.json (always) as an artifact
