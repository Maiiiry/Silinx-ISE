# Quality of the open synthesis (size and speed against XST)

The open synthesis is Silinx's front end (`core/synth-verilog.js`: the elaborated design as one flat
SystemVerilog module) + Yosys (`core/synth-open.js`, YoWASP 0.68) + Silinx's packer
(`core/fpga/pack.js`). Until 15.10.1 its netlists were about 2.5 times larger than XST's
(research/s3e-bitstream/README.md, "To do later"). This page says where the size came from, what
changed in 15.10.2 and what is left. `measure.mjs` reproduces the tables:

    node research/synth-quality/measure.mjs [--place] [project folder…]

## Where the size came from

1. **Yosys's LUT mapping for the Spartan-3E** (by far the largest part). `synth_xilinx -family
   xc3se` maps with ABC onto LUTs of up to **8** inputs and then splits each LUT5…LUT8 into LUT4s
   and MUXF5…MUXF8 (`lut_map.v`): an 8-input LUT is 16 LUT4s and 15 MUXFs, whatever the function.
   ABC took wide LUTs as cheap, so control decoding (the state and opcode bits of a control unit)
   exploded: lab11's 198 LUTs out of ABC became 542 LUT4s and 592 MUXFs. XST maps the same logic
   into 309 LUT4s and 19 MUXF5s.
2. **Arithmetic at the width of VHDL integers.** `shift_left(to_unsigned(1, 32), level) - 1` with
   a 3-bit `level` (the blinky example) is a 32-bit shifter and a 32-bit subtracter for Yosys (it
   does not know that bits 8 … 31 of the shift are 0): a 31-stage carry chain (16 slices) in series
   with the comparator, the critical path. XST builds each bit from `level` with one LUT. The same
   holds for `k + 1` of an `integer range 0 to 9`: a 32-bit adder before Yosys trims it.
3. **The packer** gave flip-flops fed by flip-flops (shift registers, registers loaded from
   registers: D through BX / BY) slices of their own, though the slices of carry chains and wide
   multiplexers often have both flip-flop slots and BX / BY free.
4. **Shift registers** (not changed): XST puts them in SRL16 LUTs; Yosys does not infer them for
   the Spartan-3E ("Shift register inference not yet supported for family xc3se").

The way the front end writes processes and case statements was not found to matter: with the LUT
mapping fixed, lab11's LUT and flip-flop counts are at or below XST's.

## What changed (15.10.2)

- **LUT mapping** (`core/synth-open.js` `synthCommands`, 4-input-LUT families): `synth_xilinx` up
  to its `map_luts` step, then the steps of `map_luts` with `abc -luts 1,1,1,1,2,4` (a LUT5 costs
  two LUT4s, a LUT6 four: what they cost once split), then `synth_xilinx` from `finalize`. Tried:
  `-nowidelut` (LUT4 only: lab11 316 LUTs / 166 slices but 16.2 ns), costs 1,1,1,1,2 / 1,1,1,1,3 /
  1,1,1,1,2,4,8 (LUT7 allowed: 326 slices) / 1,1,1,1,2,3 / 1,1,1,1,2,5 / 1,1,1,1,3,4 / 1,1,1,1,3,6;
  `-D 1`, `-dress`. 1,1,1,1,2,4 had the best slices and critical path on lab11 and a second course
  project; 1,1,1,1,2,5 is equivalent. `-abc9` and `-widemux` fail on xc3se in YoWASP 0.68.
- **Tables** (`core/synth-verilog.js` `tabulate`): an expression with arithmetic (+ - * / mod,
  comparisons, shifts by a variable amount) that reads at most 6 bits of signals and variables is
  written as a function with a case over those bits; its values come from the simulator's own
  evaluator (`interp.js evalE`), so the table computes exactly what the RTL computes. Taken when
  the table (its non-constant result bits, a LUT4 each, 2 / 4 for 5 / 6 inputs) is cheaper than
  the operators (their widths). `toVerilog(design, { tables: false })` turns it off.
- **Packer**: a flip-flop whose D comes through BX / BY first tries the free flip-flop slots of the
  carry-chain and multiplexer slices (one holding logic of its nets, else any).

## Results

Cells, LUTs, MUXF5-8, carry cells (MUXCY + XORCY), flip-flops, slices after the packer (as the open
flow packs), the placer's estimate of the critical path (seed 1). *stock*: 15.10.1's synthesis
(no tables, Yosys's own mapping; slices with the new packer); *luts*: the new LUT mapping only;
*now*: 15.10.2. lab11 and "project 2" (a second course project of the same kind) are user projects,
not in the repository.

| design | way | cells | LUTs | MUXF | carry | FFs | slices | est. ns |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lab11 | stock | 1290 | 542 | 592 | 61 | 59 | 403 | 18.2 |
| lab11 | luts | 503 | 278 | 69 | 61 | 59 | 165 | 14.2 |
| lab11 | **now** | 503 | 278 | 69 | 61 | 59 | **165** | 14.2 |
| lab11 | XST | | 309 | 19 | 61 | 71 | 180 | |
| project 2 | stock | 1561 | 677 | 724 | 65 | 59 | 468 | 16.3 |
| project 2 | **now** | 528 | 290 | 78 | 65 | 59 | **174** | 13.9 |
| project 2 | XST | | 346 | | | 71 | 201 | |
| examples/blinky | stock | 445 | 79 | 16 | 225 | 97 | 104 | 11.2 |
| examples/blinky | luts | 445 | 79 | 16 | 225 | 97 | 104 | 11.2 |
| examples/blinky | **now** | 367 | 70 | 17 | 162 | 97 | **86** | 8.0 |
| examples/blinky | XST | | 104 | | | 97 | 99 | |
| cpu8 (fixture) | stock | 918 | 389 | 369 | 65 | 54 | 281 | 16.5 |
| cpu8 | **now** | 467 | 249 | 58 | 65 | 54 | **151** | 14.2 |
| blinky (fixture) | stock | 376 | 73 | 12 | 186 | 78 | 89 | 11.1 |
| blinky | **now** | 298 | 63 | 14 | 123 | 78 | **71** | 7.9 |
| blinky | XST | | 145 | 0 | 126 | 78 | | |
| fsm | stock | 84 | 34 | 24 | 5 | 8 | 20 | 5.7 |
| fsm | **now** | 42 | 12 | 3 | 5 | 8 | **9** | 4.6 |
| fsm | XST | | 16 | 2 | 0 | 8 | | |
| adder | stock | 297 | 63 | 15 | 105 | 29 | 63 | 3.6 |
| adder | **now** | 284 | 64 | 1 | 105 | 29 | **57** | 3.6 |
| adder | XST | | 101 | 0 | 128 | 29 | | |
| srl | stock | 335 | 59 | 156 | 0 | 102 | 129 (147 with the old packer) | 2.3 |
| srl | **now** | 240 | 65 | 55 | 0 | 102 | **79** | 2.0 |
| srl | XST | | 0 | 0 | 0 | 5 + 8 SRL16 | | |

(XST: lab11 and project 2 from ISE's map report; the fixtures' cells from their netgen
post-synthesis netlists, test/fixtures/netgen; the designs with block RAMs, DCM, multipliers,
distributed RAM or tri-state buffers are left out: the packer does not take those cells yet.)

The full open flow (`research/s3e-route/open-flow.mjs`: pack, place, route, static timing, a
complete bitstream) against ISE's place and route:

| design | 15.10.1 | 15.10.2 | ISE (XST + map + par) |
|---|---|---|---|
| lab11 | 403 slices, 17.6 ns | 165 slices, 14.1 ns | 180 slices, 10.9 ns |
| project 2 | 468 slices, 15.1 ns | 174 slices, 13.1 ns | 201 slices, 10.7 ns |
| examples/blinky | 104 slices, 11.8 ns | 86 slices, 7.7 ns | 99 slices, 6.7 ns |

## What is left

- **Speed**: lab11's critical path now has XST's logic depth (state register -> control decoding
  -> ALU carry chain -> result multiplexer -> register, about 8 ns of logic), but had about 6 ns of
  routing against XST's 4: Silinx's placer and router, not the synthesis. Since closed to 4.3 ns
  (timing-driven placement with the device's delay table, LUT input swapping, branch loads in the
  router: lab11 11.6 ns by ISE's trce, blinky 7.4 ns; research/s3e-route/README.md, "Closing the
  routing gap"). Left: XST replicates the state register's flip-flops to cut their fanout (54 on
  lab11's critical path, about 0.5 ns of branch load); the open flow does not.
- **Shift registers in SRL16** (prototyped in 15.10.2, not taken: it pays off only for designs
  with shift registers, and none of lab11, project 2, blinky or cpu8 has one of 3 or more stages
  without a reset; the srl fixture: 79 slices, XST about 9). What the prototype found:
  - fixed-length chains: `xilinx_srl -fixed -minlen 3` must run on the bit-level flip-flops
    before `map_ffs` (after it, xc3se's dfflegalize has made them $_SDFFE_ cells with a reset,
    which xilinx_srl skips), with Silinx's own map file for `$__XILINX_SHREG_` (Yosys's
    cells_map.v writes SRLC32E, which the Spartan-3E does not have, for chains of 17-32; the map
    splits chains into SRL16E of 16 stages, and writes SRL16E with IS_CLK_INVERTED, not
    SRL16E_1, which Yosys's cell library lacks). The srl fixture's 36 flip-flops of fixed chains
    become 4 SRL16E (about 63 slices instead of 79).
  - variable taps (`q <= sr(to_integer(tap))`, the srl fixture's 16 x 4 bits): Yosys infers them
    only from a 1-bit `$shiftx` over the chain. Silinx's array read gives a `$pmux` whose
    `tap = 0` case stays outside the `$shiftx` (so the first stage fans out elsewhere), and a
    4-bit-wide `$shiftx` that has to be split into 1-bit ones (a small techmap does it).
  - then: SRL16E in the packer (a SLICEM: the LUT as `#RAM` with `F_ATTR::SHIFT_REG`, D through
    BX / BY with DIF_MUX / DIG_MUX, the shift enable through SR (SRINV, WSGEN), no flip-flops in
    that slice since SR would reset them), slices of type SLICEM kept on SLICEM sites by the
    placer (place.js allowedAt), its clock-to-out and setup in core/fpga/timing.js, SRL16E in
    test/fpga-sim.js (netlistSim and packedSim), and a check of the bitstream against ISE's
    (the bit database has the SLICEM shift-register features, measured with ISE's designs).
- **Distributed RAM, block RAM, multipliers, DCM, tri-state buffers in the packer** (other designs
  cannot go through the open flow yet; not a matter of synthesis size).
- **State machines**: Yosys's `fsm` pass finds no state machine in lab11's control unit (its
  `state_id` output reads the state register); XST kept its binary encoding too.
