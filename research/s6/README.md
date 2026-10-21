# Spartan-6: the plan of the open toolchain (2026-10-21)

The Silinx toolchain (synthesis, pack, place, route, static timing, bitgen without Xilinx ISE) works on
the Spartan-3E boards (Basys2, Nexys2). The Spartan-6 boards, the **Digilent Nexys3 (XC6SLX16-3CSG324)**
and **Atlys (XC6SLX45-3CSG324)**, are built with ISE only ([#1](https://github.com/pmnmalo/Silinx-ISE/issues/1)).
This note is the plan of that work: what the Spartan-6 needs that the Spartan-3E flow lacks, how each part
is measured with ISE, the order of the work and its issues. It follows the method of
[docs/OPEN-TOOLCHAIN.md](../../docs/OPEN-TOOLCHAIN.md) and of the Spartan-3E notes
([s3e-bitstream](../s3e-bitstream/README.md), [s3e-device](../s3e-device/README.md),
[s3e-place](../s3e-place/README.md), [s3e-route](../s3e-route/README.md)): black-box observation of ISE's
documented command-line tools, ISE as the oracle (byte-identical `.bit`, a clean DRC, trce's timing).

The architecture facts below come from Xilinx's public documentation: the Spartan-6 data sheets (DS160,
DS162), the CLB guide (UG384), the block RAM (UG383), DSP48A1 (UG389), clocking (UG382), SelectIO (UG381)
and configuration (UG380) user guides, and the Libraries Guide (UG615). Where a value is the documents' and
not yet measured it says so; the measurements replace it.

## What the Spartan-6 needs that the Spartan-3E flow lacks

| Part | Spartan-3E (what Silinx has) | Spartan-6 (what is new) | Issue |
|---|---|---|---|
| Synthesis | `synth_xilinx -family xc3se` and Silinx's mappings (depth, LUT6 split, MUXF, FSM…) for 4-input LUTs | `synth_xilinx -family xc6s` already runs (LUT1–LUT6, MUXF7 / MUXF8, CARRY4, FDRE…, DSP48A1, RAMB8BWER / RAMB16BWER); Silinx's own remaps are for LUT4 families only and stay so for now | — |
| Simulation models | UNISIM models of LUT1–6, MUXCY / XORCY, RAMB16_S*, MULT18X18, DCM… | **CARRY4, DSP48A1, RAMB8BWER, RAMB16BWER, SRLC32E** (the post-synthesis model of a Spartan-6 netlist cannot be simulated today) | [#720](https://github.com/pmnmalo/Silinx-ISE/issues/720) |
| Slices | one slice kind: 2 LUT4, 2 FF, MUXF5 / MUXF6…, carry (MUXCY / XORCY) | **SLICEX / SLICEL / SLICEM**: 4 LUT6 with O6 / O5 (two 5-input functions of shared inputs), 8 storage elements (AFF–DFF flip-flop or latch, A5FF–D5FF flip-flop), one control set per slice; SLICEL adds CARRY4 and F7AMUX / F7BMUX / F8MUX; SLICEM adds the LUTs as RAM (64 × 1 per LUT) and SRL32 | [#721](https://github.com/pmnmalo/Silinx-ISE/issues/721) |
| CLB | 4 slices (2 SLICEM, 2 SLICEL) | 2 slices: SLICEM + SLICEX (CLBLM) or SLICEL + SLICEX (CLBLL); half the slices are SLICEX; carry chains run up the columns of SLICEL / SLICEM | #721, #729 |
| Block RAM | RAMB16_S* (18 Kb) | RAMB16BWER (18 Kb, byte write enables, output registers) splitting into two RAMB8BWER (9 Kb, TDP or SDP of 36 bits) | #720, #728 |
| Multipliers | MULT18X18SIO | DSP48A1: pre-adder, 18 × 18 multiplier, 48-bit post-adder / accumulator, OPMODE, its pipeline registers, cascades | #720, #728 |
| Clocking | BUFGMUX, DCM | 16 BUFGMUX, BUFIO2 / BUFIO2FB from the clock pads (map inserts them), BUFH per clock region, CMTs of 2 DCM_SP + 1 PLL_BASE (2 CMTs in the LX16, 4 in the LX45), BUFPLL | #727 |
| I/O | IOB with its registers | IOB pairs (master / slave), the IOI tiles with ILOGIC2 / OLOGIC2 (registers, SERDES) and IODELAY2; the boards' banks at 3.3 V (and 1.8 / 2.5 V on the Atlys) | #727 |
| Routing fabric | singles, doubles, hexes, long lines, the Spartan-3E switch box | a new INT switch box: single, double and quad wires (the device report will say whether there is anything longer), its own logic inputs and outputs, the clock spines and BUFH rows; every tile type new | #723, #726, #730 |
| Device descriptions | the four Spartan-3E parts' (`core/fpga/devices/`) | `xc6slx16csg324-3` and `xc6slx45csg324-3`, from `xdl -report -pips -all_conns`; `core/fpga/device.js` taught the new tile types | [#723](https://github.com/pmnmalo/Silinx-ISE/issues/723) |
| Bitstream | UG332: 32-bit words, frames of 73 words (XC3S250E), FAR one word | UG380: **16-bit configuration words**, Type 1 headers with a 6-bit register address, FAR_MAJ (block type, row, major) and FAR_MIN (minor), frames of 65 words for every part, new registers (COR1 / COR2, CWDT, HC_OPT_REG, MODE_REG, GENERAL1–5…), the block RAM content in frames of its own | [#724](https://github.com/pmnmalo/Silinx-ISE/issues/724) |
| Bit database | LUT, slice, routing, I/O, block RAM, multiplier, DCM bits of the Spartan-3E tile types | all of it again for the Spartan-6 tile types | #725–#728 |
| Place, route, timing | `core/fpga/place.js`, `route.js`, `timing.js` | placer and router on the new sites and graph, a delay model of the -3 speed grade fitted to trce | #729, #730, #731 |

The Spartan-3E code stays as it is: the Spartan-6 code goes into new files (`core/fpga/s6/`) or behind the
device's family, so that the Spartan-3E work of the other sessions is never disturbed.

### The devices

| Part (board) | IDCODE (UG380) | Configuration size (UG380) | Frame | Slices (DS160) | RAMB16BWER | DSP48A1 | CMTs |
|---|---|---|---|---|---|---|---|
| XC6SLX16 (Nexys3) | `04002093` | 3 731 264 bits | 65 words of 16 bits (1 040 bits) | 2 278 | 32 | 32 | 2 |
| XC6SLX45 (Atlys) | `04008093` | 11 939 296 bits | 65 words of 16 bits | 6 822 | 116 | 58 | 4 |

The IDCODEs and sizes are the documents' values: stage S6-A measures them on ISE's bitgen.

## How each part is measured with ISE

As for the Spartan-3E: test designs written in XDL (or HDL where XDL cannot express a setting), turned
into bitstreams by `xdl -xdl2ncd` and `bitgen`, compared; reference designs implemented by ISE from HDL
(xst, ngdbuild, map, par, trce). ISE runs in its Docker image (linux/amd64, emulated on Apple Silicon:
about 50 s per small Spartan-3E design). The Spartan-6 devices are larger (the XC6SLX16's configuration is
3.6 times the XC3S250E's, the XC6SLX45's 11.5 times), so the times below are estimates; night 1 measures
them and this table is corrected then.

| Stage | What | ISE runs | Estimated time | Scripts | Issue |
|---|---|---|---|---|---|
| **S6-0** (night 1) | device reports of both parts; an empty design's bitstream of each, with and without CRC; the seven examples implemented from their HDL on the Nexys3 and the Atlys (map's slice counts, the routed XDL, trce); the open synthesis's netlists of the examples implemented by ISE (the packer comparison) | 2 reports, 4 empty, 14 + 14 implementations | reports 1–3 h (the XC6SLX45's the longest, several GB before gzip); implementations 3–8 min each, 2–3 h at 3 containers | `night1.mjs`, `ise-s6.sh`, `night1-remote.sh`, `summarize-night1.mjs` (this folder) | [#733](https://github.com/pmnmalo/Silinx-ISE/issues/733) |
| S6-A | the bitstream format: the packet sequence, the FAR order and the frame count, the CRC, bitgen's options (StartUpClk, the PROM file) | about 20 | 1 h | the empty designs of S6-0, then one design per option | #724 |
| S6-B | where every LUT is: one design numbering every LUT (as `gen-map.mjs`), its binary-coded variants (64 bits per LUT) | about 15 per part | 1–2 h | to write from `gen-map.mjs` / `decode-map.mjs` | #725 |
| S6-C | the slice settings, per slice kind (X, L, M), in the slice harnesses of `gen-harness.mjs` | about 300 | 5–8 h | from `gen-slice.mjs`, `gen-hvar.mjs` | #725 |
| S6-D | the routing switches, by PIP drop in batches (the INT tile and the other tile types) | 1 500–3 000 | several nights | from `gen-pipdrop.mjs`, `gen-pipcover.mjs`, `pips-to-db.mjs` | #726 |
| S6-E | I/O and clocking: every pad's settings at random, the BUFIO2 / BUFG / BUFH paths, DCM and PLL settings | about 500 | 1–2 nights | from `gen-iob.mjs`, `gen-iorand.mjs`, `gen-sitevar.mjs`, `gen-dcmhdl.mjs` | #727 |
| S6-F | block RAM content and settings, DSP48A1 settings | about 300 | 1 night | from `gen-bram.mjs`, `gen-sitevar.mjs` | #728 |
| S6-G | timing: trce on the examples and on generated paths (each cell and wire kind) | about 200 | 1 night | from `research/s3e-route` (`ise-timing-check.sh`, `timing-fit.mjs`) | #731 |
| S6-H | the XC6SLX45 from the XC6SLX16's tile types (stage F of the Spartan-3E: the larger part's layout and residuals) | about 100 | 1 night | from `impl-remote.sh`, `ana-residual.mjs` | #725–#728 |

ISE's raw outputs (`.bit`, `.ncd`, `.xdl`, `.xdlrc`, the logs) never enter the repository: the scripts keep
them in a work folder outside it, and only Silinx's own records of the observations (counts, bit
positions, fitted delays) go into `research/s6/measured/` and, later, `research/s6/db/`. The machine ISE
runs on is given on the command line only (`SILINX_ISE_HOST=user@host`), never in a file.

### Night 1 (S6-0): how to run it

```sh
node research/s6/night1.mjs ~/s6-night1                      # the work folder: designs, UCFs, netlists
SILINX_ISE_HOST=user@host sh research/s6/night1-remote.sh ~/s6-night1
node research/s6/summarize-night1.mjs ~/s6-night1            # -> research/s6/measured/night1.json
```

`night1.mjs` writes, for each board (`nexys3`, `atlys`): `impl-<board>/<example>/` (the example's HDL, its
UCF from the board's pin assignment, `top.txt` naming its top) and `edif-<board>/<example>/` (the open
synthesis's netlist for the Spartan-6, `top.edf`, with the same UCF), and `empty/<part>.xdl`.
`ise-s6.sh` runs inside the ISE container (`report`, `empty`, `impl`, `edif`); `night1-remote.sh` copies the
work folder to the machine with Docker and ISE, runs it there (3 containers), copies the results back and
prints how long each part took. `summarize-night1.mjs` writes what the later stages need: per example and
board, map's slices (by kind), LUTs, flip-flops, block RAMs and DSP48A1s, par's routing result and trce's
minimum period; per part, the empty bitstream's packets (registers written, word counts, the frame data's
length) and the device report's tile, site and PIP counts.

## The order of the work

1. **Without ISE** (night 0, this one): the plan and the issues; the simulation models of the Spartan-6
   primitives, so the open synthesis's Spartan-6 netlists are simulated against the RTL in VHDL and
   Verilog (#720); the slice model and the packer (#721); the devices' entries behind a developer flag
   (#722); the scripts of night 1 (#733).
2. **Night 1** (S6-0): the reports and reference designs. Then the device descriptions (#723) and the
   packer's comparison with map (#721).
3. **The format** (S6-A, #724): an empty design byte-identical; nothing else can be checked before it.
4. **Logic** (S6-B, S6-C, #725), then **routing** (S6-D, #726): the gates example (no clock) can then be
   built end to end with a placer and a router of a first kind (#729, #730).
5. **I/O and clocks** (S6-E, #727): every example with a clock.
6. **Block RAM and DSP** (S6-F, #728): stopwatch.
7. **Timing** (S6-G, #731), the **XC6SLX45** (S6-H), and the **flow end to end** (#732): the examples
   byte-identical with ISE on both boards, the flag removed.

## The issues

| Issue | What | Needs ISE |
|---|---|---|
| [#720](https://github.com/pmnmalo/Silinx-ISE/issues/720) | simulation models of the open synthesis's Spartan-6 primitives | no |
| [#721](https://github.com/pmnmalo/Silinx-ISE/issues/721) | the slice model and the packer | the comparison only |
| [#722](https://github.com/pmnmalo/Silinx-ISE/issues/722) | the open flow's device entries behind a developer flag | no |
| [#723](https://github.com/pmnmalo/Silinx-ISE/issues/723) | device descriptions of the two parts | yes |
| [#724](https://github.com/pmnmalo/Silinx-ISE/issues/724) | the bitstream format, reader and writer | yes |
| [#725](https://github.com/pmnmalo/Silinx-ISE/issues/725) | bit database: LUTs and slices | yes |
| [#726](https://github.com/pmnmalo/Silinx-ISE/issues/726) | bit database: routing | yes |
| [#727](https://github.com/pmnmalo/Silinx-ISE/issues/727) | bit database: I/O and clocking | yes |
| [#728](https://github.com/pmnmalo/Silinx-ISE/issues/728) | bit database: block RAM and DSP48A1 | yes |
| [#729](https://github.com/pmnmalo/Silinx-ISE/issues/729) | the placer | the check only |
| [#730](https://github.com/pmnmalo/Silinx-ISE/issues/730) | the router | the check only |
| [#731](https://github.com/pmnmalo/Silinx-ISE/issues/731) | static timing | yes |
| [#732](https://github.com/pmnmalo/Silinx-ISE/issues/732) | the flow end to end on both boards | yes |
| [#733](https://github.com/pmnmalo/Silinx-ISE/issues/733) | this plan and night 1's scripts | the runs |

## Decisions

Recorded here because the work was planned without the author's answers (2026-10-21):

- **Both boards from the start**, the XC6SLX16 first: the tile types are shared, the XC6SLX45 is stage S6-H.
- **New files for the Spartan-6** (`core/fpga/s6/`, `research/s6/`), the Spartan-3E modules unchanged but
  for the shared models (UNISIM, the compiled primitives), whose new primitives add to them.
- **Silinx's synthesis remaps stay for the LUT4 families**: the Spartan-6 netlist is Yosys's `xc6s`
  mapping as it is, until the flow works end to end and its quality can be measured against XST.
- **A developer flag** (`SILINX_SPARTAN6_OPEN=1`) shows the parts of the flow that exist; the users see
  nothing new until #732.
- **The device descriptions** of the two parts will ship as the Spartan-3E boards' do, the decision of
  2026-10-11 (docs/OPEN-TOOLCHAIN.md) extended to the two Spartan-6 boards Silinx supports.

## Trying the parts that exist

The Spartan-6 parts of the flow are behind a developer flag (#722): with `SILINX_SPARTAN6_OPEN=1` in the server's
environment (`SILINX_SPARTAN6_OPEN=1 npm start`), a project on the Nexys3 or the Atlys in the Silinx toolchain mode
runs the steps that exist (the synthesis for the Spartan-6 and its Post-Synthesis Simulation Model) and refuses the
others; without it the Spartan-6 is refused as before. The browser edition has no flag.

## Files

| File | What it does |
|---|---|
| `README.md` | This plan, and the results as they come |
| `night1.mjs` | Night 1's work folder: the examples' HDL and UCFs on both boards, the open synthesis's EDIF netlists, the empty designs |
| `ise-s6.sh` | Inside the ISE container: `report`, `empty`, `impl`, `edif` |
| `night1-remote.sh` | Night 1 on the machine with Docker and ISE (`SILINX_ISE_HOST` on the command line) |
| `summarize-night1.mjs` | Night 1's results as `measured/night1.json` (counts and observations, no Xilinx file) |
| `bits6.mjs` | Reads a Spartan-6 `.bit`: its header and the UG380 packets (16-bit words) |
