# Schematic corpus: schematics through every stage of Silinx

Like the design corpus (`test/designs-corpus/`) for HDL designs, the diagram corpus (`test/diagram-corpus/`) for
state machines and Petri nets, and the HLS corpus (`test/hls-corpus/`) for C, this corpus (#1687) takes
**schematics** through everything Silinx does with them, and records what each stage gives.

    npm test                                              test/schematic-corpus.test.js: the fast stages (a few seconds)
    npm run test:schematics                               the committed schematics, every stage (about 12 minutes)
    npm run test:schematics -- --filter bus --stages load,check,hdl,sim,ise
    npm run test:schematics -- --generated --filter itc99 the schematics of the design corpus (the network once)
    npm run test:schematics -- --update                   record the results as the expectations, and the table below

`run.mjs`'s long part (Yosys and the flow to a `.bit`, the generated schematics) is not part of `npm test`: run it
by hand, or at a release.

## The schematics

- **Hand-made** (`hand/*.sch.json`, Silinx's own, AGPL-3.0-only): small schematics, each about one thing, drawn by
  `make-hand.mjs` (each pin a short wire and a net name, then laid out by Beautify Sheet, except the ones that test
  the drawing itself: turned symbols, markers' sides, their own wires). Each has a **reference**,
  `hand/<name>.ref.vhd`: its behaviour written independently in VHDL.
- **ISE** (`test/fixtures/ise-sch/*.sch`, MIT / Apache-2.0, see its README): imported, then as any other; the two
  combinational ones have a reference (`ise/*.ref.vhd`).
- **The gates example** (`examples/gates/src/gates.sch.json`), its reference `example/gates.ref.vhd`.
- **Generated** (`--generated`): every design of the design corpus (`test/designs-corpus/manifest.json`, fetched,
  never committed) converted by Convert to Schematic (`core/hdl-to-sch.js`), its reference the design itself.
  Their schematics are written to `.cache/schematic-corpus/` and never committed: they are made of the designs'
  code. A generated schematic keeps HDL blocks in its design's language: it is generated in that language only.

| schematic | covers |
| --- | --- |
| bus_taps | taps of one bit and of several, bits reversed through a bus join, a tap of an internal bus, taps into a gate |
| bus_taps_turned | taps turned 90 / 180 / 270 and mirrored, I/O markers on their four sides |
| bus_join | joins of parts of several widths, a join of joins, a bus split again |
| net_names | nets joined by name only, a bus named `d(3:0)` |
| gates_inverted | gates of 2 to 5 inputs, inverted inputs (AND2B1, OR3B2, NAND3B1, AND4B2), NOR, XOR, XNOR, bitwise gates |
| vcc_gnd | VCC / GND of one bit and of a width, constants, a constant into an adder |
| arith | an adder with carry in and out, a subtractor with borrow out, comparators unsigned and signed |
| mux_dec | M2_1 of a width, M4_1, M8_1 with its select as a bus and an enable, a decoder, a priority encoder, a demultiplexer |
| flipflops | FD, FDC, FDCE, FDRE, FDPE, FTCE, a register, up and down counters, the clock through a BUFG |
| tristate | BUFE and BUFT on one net, a bus of tri-state buffers |
| half_adder, full_adder | hierarchy: module symbols of another schematic |
| curved_hops | wires drawn as curves, crossing without connecting |
| bus_bitnames | ISE's way of tapping a bus: the tap's wire named `a(0)` (#1688) |
| bus_offset | a bus named `d(7:4)` (#1689) |
| tap_range | a tap of bits outside its bus (#1690) |
| tap_reversed | a tap with its MSB below its LSB (#1691) |

The last four are what Silinx gets wrong today: they are kept with their failures recorded, so that a fix shows
as a change of `expected.json`.

## The stages

| stage | what |
| --- | --- |
| load | the document read and saved the same (`normalizeDoc` keeps it as it is); an ISE schematic: imported |
| check | the schematic's own checks (its netlist) and its HDL generation, in VHDL and Verilog |
| hdl | Check Syntax of the generated VHDL and Verilog (parse, elaborate, the design checks); for a generated schematic, only the messages its design did not have |
| sim | the generated VHDL and Verilog simulated against the reference under the same stimulus: every input value for a combinational design of at most 12 input bits, else 300 seeded random cycles (the clocks `clk…`, the resets as `test/diff-synth.js` drives them); an output bit the reference leaves at X is not compared |
| ise | exported as an ISE schematic (`.sch`, its `.sym` and HDL files as the ISE project's), imported again: its HDL simulated against the schematic's |
| synth | Yosys's synthesis of the generated VHDL (Optimization Effort Normal): its LUTs and flip-flops |
| flow | the Silinx toolchain to a `.bit` on the XC3S100E, XC3S250E (CP132), XC3S500E and XC3S1200E (FG320), the clock on the boards' oscillator pin |

Each stage records `pass` (the flow: `complete`), `skip: …` or the first reason it does not pass, and its exact
warnings. `expected.json` holds them for every schematic, and the size of its circuit; a run fails on any
difference: record an improvement with `--update`, make an issue of a loss.

## What it found

| issue | |
| --- | --- |
| #1688 | a net name of bus bits, `a(0)` of `a(3:0)` (ISE's way of naming a tap's wire), is refused |
| #1689 | a bus named `d(7:4)` is declared `(3 downto 0)`: its indices lost |
| #1690 | a bus tap of bits outside its bus is not reported |
| #1691 | a bus tap with its MSB below its LSB writes illegal HDL |
| #1692 | the front end accepts a slice in the opposite direction of its vector |
| #1693 | a 1-bit tap into an output marker read back writes `msb_int <= a(7 downto 7)`: the VHDL does not compile |
| #1694 | the ISE export writes a BUFG (any device primitive) as `xl_bufg`, imported back as an empty block |
| #1695 | the ISE export of an HDL block lacks the module's declarations it uses |
| #1697 | Convert to Schematic refuses a Verilog module with escaped port names |
| #1715 | Convert to Schematic refuses a vector driven part by part (`assign y[3:0] = …; assign y[7:4] = …`) |
| #1716 | Convert to Schematic refuses a Verilog module with `` `ifdef `` / `` `else `` inside it |
| #1717 | Convert to Schematic writes a port of width 0, which `normalizeDoc` makes 1 |
| #1763 | the ISE export renames escaped port names (`\opcode[0]`) |

The generated part: of the design corpus's designs, 55 are converted and pass the document, the checks, Check
Syntax and the simulation against their HDL (two whose own HDL stops in simulation under random inputs, ITC'99 b04
and b11, apart); their ISE export does not compile in 40 of them (#1695), and renames the escaped port names of
four EPFL netlists (#1763). Ten (the larger EPFL netlists, thousands of gates) are not drawn within the time and
memory limits (`skip: too large`).

## The results

<!-- results -->
| Schematic | Source | load | check | hdl | sim | ise | synth (LUTs / FFs) | flow | Warnings |
|---|---|---|---|---|---|---|---|---|---|
| bus_taps | hand | pass | pass | pass | pass | pass | pass (1 / 0) | complete | 1 |
| bus_taps_turned | hand | pass | pass | pass | pass | pass | pass (0 / 0) | complete | 1 |
| bus_join | hand | pass | pass | pass | pass | pass | pass (0 / 0) | complete | 1 |
| net_names | hand | pass | pass | pass | pass | pass | pass (6 / 0) | complete | 1 |
| gates_inverted | hand | pass | pass | pass | pass | pass | pass (11 / 0) | complete | 1 |
| vcc_gnd | hand | pass | pass | pass | pass | pass | pass (0 / 0) | complete | 1 |
| arith | hand | pass | pass | pass | pass | pass | pass (20 / 0) | complete | 1 |
| mux_dec | hand | pass | pass | pass | pass | pass | pass (16 / 0) | complete | 1 |
| flipflops | hand | pass | pass | pass | pass | pass | pass (1 / 17) | complete | 1 |
| tristate | hand | pass | pass | pass | pass | pass | pass (2 / 0) | complete | 2 |
| half_adder | hand | pass | pass | pass | pass | pass | pass (2 / 0) | complete |  |
| full_adder | hand | pass | pass | pass | pass | pass | pass (2 / 0) | complete | 1 |
| curved_hops | hand | pass | pass | pass | pass | pass | pass (0 / 0) | complete |  |
| bus_bitnames | hand | pass | fail: invalid net name 'a(0)' | fail: vhdl: bus_bitnames.vhd:16: expected ':' but found '(' | mismatch: vhdl: does not elaborate: bus_bitnames.vhd:16 expected ':' but found '(' | mismatch: the reference does not elaborate: bus_bitnames.vhd:16 expected ':' but found '(' | fail: bus_bitnames.vhd:16 expected ':' but found '(' | xc3s100ecp132-4: fail: the design has errors | 2 |
| bus_offset | hand | pass | pass | pass | mismatch: vhdl: simulation: the simulation stopped (error) | mismatch: the reference's simulation: the simulation stopped (error) | pass (0 / 0) | complete | 3 |
| tap_range | hand | pass | pass | pass | skip: no reference | mismatch: the reference's simulation: the simulation stopped (error) | pass (0 / 0) | complete | 5 |
| tap_reversed | hand | pass | pass | fail: vhdl: tap_reversed.vhd:16: slice 1 to 2 of 'a' against its direction (3 downto 0) | skip: no reference | mismatch: the reference does not elaborate: tap_reversed.vhd:16 slice 1 to 2 of 'a' against its direction (3 downto 0) | pass (0 / 0) | complete | 1 |
| ise-MyAND2b4 | ise | pass | pass | pass | pass | pass | pass (4 / 0) | complete |  |
| ise-Mux4to1b4 | ise | pass | pass | pass | pass | pass | pass (8 / 0) | complete |  |
| ise-list1 | ise | pass | pass | pass | skip: no reference | pass | pass (1 / 4) | complete |  |
| ise-Counter_2b | ise | pass | pass | pass | skip: no reference | pass | pass (1 / 2) | complete |  |
| gates | example | pass | pass | pass | pass | pass | pass (1 / 0) | complete |  |

Generated from the design corpus: 65 designs; load 55, check 55, hdl 55, sim 53, ise 11 pass (each design's stages in expected.json).
<!-- /results -->
