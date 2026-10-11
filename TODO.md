# To do

What is planned for Silinx ISE, most important first. Done items move to the
[CHANGELOG](CHANGELOG.md).

## Open toolchain (synthesis, place and route, bitstream without Xilinx ISE)

How it is developed: [docs/OPEN-TOOLCHAIN.md](docs/OPEN-TOOLCHAIN.md).

- **The other Spartan-3E boards, on the boards:** blinky and lab11 for the Basys2-100, Nexys2-500
  and Nexys2-1200 are byte-identical to ISE's bitgen; program them on the boards (and the Spartan-3E
  Starter Kit's test, test/fixtures/open-flow/feat_starter). The XC3S1200E's long-line splitters are
  measured but not used by the router (a routed design does not tell their direction: resolve it
  from the device graph). The open flow places one DCM only, on the top-left site: the others are
  measured now (settings, pins), to place a DCM on any of them (the clock input's pad and the
  global buffers it reaches decide which).
- **XC3S250E (and all) features not measured yet:** the settings of the IOB flip-flops and DDR
  registers (their clock pins' switches are measured; gen-sitedrop.mjs found the clock inverters and
  D multiplexers, not the input delays, which are bits near the pads: a per-pad campaign as
  gen-iob.mjs --perpad, on designs whose IOB registers ISE placed); the 16 global buffers of the
  left and right sides (their settings set no bits, but the side clock tiles' input switches set bits
that depend on the other inputs used: a campaign of their own); CLKIN_DIVIDE_BY_2 and DESKEW_ADJUST =
  SOURCE_SYNCHRONOUS (xdl refuses the changed XDL: designs implemented by ISE); the DCM input
  frequencies between the measured limits (the open flow refuses them: dcmPeriodFeatures); a few
  corner pins (research/s3e-bitstream/README.md, stages D and F). The open flow fails with the
  reason for a design that needs one of them. Done in 15.10.2: block RAM, multipliers, distributed
  RAM, shift registers and the top-left DCM in the open flow (test/fixtures/open-flow); the DCMs'
  pins, the BUFGMUX inputs, select and its inverter for all 8 buffers of the top and bottom; the
  missing bit of dram at seed 1 (a horizontal clock row's bit in a block-RAM column); every DCM's
  settings, input period and STARTUP_WAIT; the FG320 pads' I/O settings.
- **Spartan-6 boards: Nexys3 (XC6SLX16) and Atlys (XC6SLX45).** Not supported by the open
  toolchain yet (they work with ISE, and *Synthesize - Yosys (open)* already synthesizes for them).
  To do: the Spartan-6 packer and placer (6-input LUTs, SLICEX / SLICEL / SLICEM), the bit database
  (a new measurement campaign), the bitstream writer (the Spartan-6 format, UG380), the delay
  model; the device descriptions of the two parts.
- **Measuring the device description ourselves** (black-box, like the bit database) instead of
  computing it from ISE's device report: about 2-4 weeks for one device.
- **Synthesis quality** (research/synth-quality/README.md). Done in 15.10.2: the open synthesis's
  netlists are now as small as XST's or smaller (lab11: 165 slices against XST's 180, was 403).
  Done in 15.10.2 too: fixed-length shift registers in SRL16 (the srl fixture 63 slices instead of
  79). Left: variable-tap shift registers (`q <= sr(tap)`: Yosys infers them only from a 1-bit
  $shiftx, Silinx's array read gives a $pmux), the SRLC16 cascade (Q15), FSM re-encoding (Yosys
  finds no state machine in lab11's control unit).
- **Speed of the open flow** (research/s3e-route/README.md, "Closing the routing gap"): lab11 11.6
  ns against 10.9 ns with ISE (was 13.7), blinky 7.4 against 6.7. Left: replication of high-fanout
  flip-flops (lab11's state register drives 54 loads; XST replicates it), the carry's data input
  (CY0F / CY0G) swappable between F1 / F2, placements of a design with few slices in one CLB
  sharing one output (blinky's 9-load net).
- **Timing:** hold time, clock skew and pad (OFFSET) paths; the delays of block RAMs, multipliers
  and the SLICEM's RAMs / shift registers are estimates of the data sheet's order
  (core/fpga/timing.js), to fit to trce like the slices' (and the paths through a DCM: its output
  clocks are analysed as clocks of their own).
- **Synthesis quality:** Yosys's netlists of lab11 are about 2.9 times larger than XST's
  (research/s3e-bitstream/README.md, "To do later").
- **Design corpus** (test/designs-corpus/README.md, "Open"): the packer's block RAM, distributed RAM,
  SRL16 and MULT18X18 (every CPU and FIFO of the corpus needs one); `C2VDD` carry inputs in the bit
  database (fpu-adder); a second clock from a pad (BUFGMUX inputs); constant function calls folded
  and VHDL constant signals and enum initial values in the open synthesis; check the corpus's
  larger designs on the XC3S500E / 1200E once their bit databases exist.
- **Timing:** hold time, clock skew and pad (OFFSET) paths; the router's cost with the branch loads.

## Front ends and simulator

- Xilinx primitives (RAMB16_S9, MULT18X18SIO, DCM_SP…) instantiated in Verilog: only VHDL's
  `library UNISIM` brings in their models (core/unisim.js primitiveSources), so the open flow takes
  them from VHDL only (test/fixtures/open-flow/hard_prim).
- Verilog constructs Silinx cannot read yet, found by the corpus test (test/corpus/README.md):
  explicit port expressions in a module header (`.a(x[3:0])`; constmsk_testmap.v also uses Yosys's
  own `(...)`), `rand` / `const` qualifiers, identifiers that start with `$` (a Yosys extension,
  shregmap.v), unions and enumeration name ranges (`A[3]`), SystemVerilog functions with output
  arguments called in expressions, packages and `import`.
- A variable's initializer that is not constant (`output integer y = x + 1`, fib.v): per the
  standard an initial value set once at time 0; Silinx reports "expression is not constant", Yosys
  appears to make it a continuous assignment (to be checked before choosing).
- Hierarchical references to a constant (a parameter, a specparam) of another instance (`u.P`):
  only signals are found today.
  hierarchical names into generate blocks, instance arrays, `localparam` in functions, `$size`,
  `$floor`, `$countbits`, `wand` / `wor` / `supply1` ports, typedefs and structs, `specify`.
- From the design corpus (test/designs-corpus/README.md): VHDL slices of arrays of vectors
  (light8080), null ranges, hierarchical references into named blocks and through the top's name
  (secworks testbenches), the location of the `$clog2` warning in a declaration's range.
