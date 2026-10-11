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
- **XC3S250E features not measured yet:** the DCMs' own pins and the other 3 DCMs, IOB flip-flops
  and DDR, the inputs of 7 of the 8 BUFGMUX, a few corner and block-RAM pins
  (research/s3e-bitstream/README.md, stage D).
- **Measuring the device description ourselves** (black-box, like the bit database) instead of
  computing it from ISE's device report: about 2-4 weeks for one device.
- **Synthesis quality** (research/synth-quality/README.md). Done in 15.10.2: the open synthesis's
  netlists are now as small as XST's or smaller (lab11: 165 slices against XST's 180, was 403).
  Left: shift registers as SRL16 (prototyped, not done: it pays off only for designs with shift
  registers of 3 or more stages without reset, none of lab11, blinky or cpu8; see the README for
  what it needs: Yosys passes and a map file, the variable tap, SLICEM in the packer, placer,
  timing model and simulators), distributed RAM in the packer (RAM16X1S…), FSM re-encoding (Yosys
  finds no state machine in lab11's control unit).
- **Speed of the open flow** (research/s3e-route/README.md, "Closing the routing gap"): lab11 11.6
  ns against 10.9 ns with ISE (was 13.7), blinky 7.4 against 6.7. Left: replication of high-fanout
  flip-flops (lab11's state register drives 54 loads; XST replicates it), the carry's data input
  (CY0F / CY0G) swappable between F1 / F2, placements of a design with few slices in one CLB
  sharing one output (blinky's 9-load net).
- **Timing:** hold time, clock skew and pad (OFFSET) paths.

## Front ends and simulator

- Verilog constructs Silinx cannot read yet, found by the corpus test (test/corpus/README.md):
  hierarchical names into generate blocks, instance arrays, `localparam` in functions, `$size`,
  `$floor`, `$countbits`, `wand` / `wor` / `supply1` ports, typedefs and structs, `specify`.
