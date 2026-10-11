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
- **Synthesis quality:** Yosys's netlists of lab11 are about 2.9 times larger than XST's
  (research/s3e-bitstream/README.md, "To do later").
- **Design corpus** (test/designs-corpus/README.md, "Open"): the packer's block RAM, distributed RAM,
  SRL16 and MULT18X18 (every CPU and FIFO of the corpus needs one); `C2VDD` carry inputs in the bit
  database (fpu-adder); a second clock from a pad (BUFGMUX inputs); constant function calls folded
  and VHDL constant signals and enum initial values in the open synthesis; check the corpus's
  larger designs on the XC3S500E / 1200E once their bit databases exist.
- **Timing:** hold time, clock skew and pad (OFFSET) paths; the router's cost with the branch loads.

## Front ends and simulator

- Verilog constructs Silinx cannot read yet, found by the corpus test (test/corpus/README.md):
  hierarchical names into generate blocks, instance arrays, `localparam` in functions, `$size`,
  `$floor`, `$countbits`, `wand` / `wor` / `supply1` ports, typedefs and structs, `specify`.
- From the design corpus (test/designs-corpus/README.md): VHDL slices of arrays of vectors
  (light8080), null ranges, hierarchical references into named blocks and through the top's name
  (secworks testbenches), the location of the `$clog2` warning in a declaration's range.
