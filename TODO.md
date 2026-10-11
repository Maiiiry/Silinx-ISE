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
- **Synthesis quality:** Yosys's netlists of lab11 are about 2.9 times larger than XST's
  (research/s3e-bitstream/README.md, "To do later").
- **Timing:** hold time, clock skew and pad (OFFSET) paths; the router's cost with the branch loads.

## Front ends and simulator

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
