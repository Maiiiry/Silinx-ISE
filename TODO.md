# To do

What is planned for Silinx ISE, most important first. Done items move to the
[CHANGELOG](CHANGELOG.md).

## Open toolchain (synthesis, place and route, bitstream without Xilinx ISE)

How it is developed: [docs/OPEN-TOOLCHAIN.md](docs/OPEN-TOOLCHAIN.md).

- **Implement with the open toolchain from the interface:** a toolchain mode "Open toolchain
  (experimental, no ISE)" in *Toolchain Settings*, so that Implement, Generate Programming File,
  the FPGA view and Program use it. Today the full open flow runs from the command line
  (`research/s3e-route/open-flow.mjs`).
- **The other Spartan-3E boards:** the bit databases of the XC3S100E (Basys2-100), XC3S500E
  (Nexys2-500, Spartan-3E Starter Kit) and XC3S1200E (Nexys2-1200), measured as the XC3S250E's
  was; their device descriptions ship with Silinx. Then a check of a few designs on each board.
- **Building a device description from the user's own ISE** from the interface, for the devices
  whose description does not ship with Silinx.
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
  Left: shift registers as SRL16 (Yosys does not infer them for the Spartan-3E; the packer and
  placer would need SLICEM sites), distributed RAM in the packer (RAM16X1S…), the remaining speed
  gap (lab11 14.1 ns in the open flow against 10.9 ns after ISE's place and route: mostly
  placement and routing, the logic depth is XST's), FSM re-encoding (Yosys finds no state machine
  in lab11's control unit).
- **Timing:** hold time, clock skew and pad (OFFSET) paths; the router's cost with the branch loads.

## Front ends and simulator

- Verilog constructs Silinx cannot read yet, found by the corpus test (test/corpus/README.md):
  hierarchical names into generate blocks, instance arrays, `localparam` in functions, `$size`,
  `$floor`, `$countbits`, `wand` / `wor` / `supply1` ports, typedefs and structs, `specify`.
