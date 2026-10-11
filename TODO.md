# To do

What is planned for Silinx ISE, most important first. Done items move to the
[CHANGELOG](CHANGELOG.md).

## Open toolchain (synthesis, place and route, bitstream without Xilinx ISE)

How it is developed: [docs/OPEN-TOOLCHAIN.md](docs/OPEN-TOOLCHAIN.md).

- **The other Spartan-3E boards:** the bit databases of the XC3S100E (Basys2-100), XC3S500E
  (Nexys2-500, Spartan-3E Starter Kit) and XC3S1200E (Nexys2-1200), measured as the XC3S250E's
  was; their device descriptions ship with Silinx. Then a check of a few designs on each board.
- **Spartan-6 boards: Nexys3 (XC6SLX16) and Atlys (XC6SLX45).** Not supported by the open
  toolchain yet (they work with ISE, and *Synthesize - Yosys (open)* already synthesizes for them).
  To do: the Spartan-6 packer and placer (6-input LUTs, SLICEX / SLICEL / SLICEM), the bit database
  (a new measurement campaign), the bitstream writer (the Spartan-6 format, UG380), the delay
  model; the device descriptions of the two parts.
- **XC3S250E features not measured yet:** the other 3 DCMs, the top-left DCM's outputs other than
  CLK0 / CLK2X / CLKDV / CLKFX on global buffers, CLKIN from pads other than B8, input periods
  other than 20 ns (CLKIN_PERIOD changes 2 bits), STARTUP_WAIT (the COR register), IOB flip-flops
  and DDR, the inputs of 7 of the 8 BUFGMUX (clock switching with a BUFGMUX), a few corner and
  block-RAM pins (research/s3e-bitstream/README.md, stage D). The open flow fails with the reason
  for a design that needs one of them. Done in 15.10.2: block RAM, multipliers, distributed RAM,
  shift registers and the top-left DCM in the open flow (test/fixtures/open-flow).
- **Measuring the device description ourselves** (black-box, like the bit database) instead of
  computing it from ISE's device report: about 2-4 weeks for one device.
- **Synthesis quality** (research/synth-quality/README.md). Done in 15.10.2: the open synthesis's
  netlists are now as small as XST's or smaller (lab11: 165 slices against XST's 180, was 403).
  Done in 15.10.2 too: fixed-length shift registers in SRL16 (the srl fixture 63 slices instead of
  79). Left: variable-tap shift registers (`q <= sr(tap)`: Yosys infers them only from a 1-bit
  $shiftx, Silinx's array read gives a $pmux), the SRLC16 cascade (Q15), the remaining speed
  gap (lab11 14.1 ns in the open flow against 10.9 ns after ISE's place and route: mostly
  placement and routing, the logic depth is XST's), FSM re-encoding (Yosys finds no state machine
  in lab11's control unit).
- **Timing:** hold time, clock skew and pad (OFFSET) paths; the router's cost with the branch loads;
  the delays of block RAMs, multipliers and the SLICEM's RAMs / shift registers are estimates of
  the data sheet's order (core/fpga/timing.js), to fit to trce like the slices' (and the paths
  through a DCM: its output clocks are analysed as clocks of their own).

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
