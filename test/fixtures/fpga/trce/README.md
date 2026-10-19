# Routed designs timed by ISE's trce

Designs placed and routed by the Silinx toolchain (research/s3e-route/open-flow.mjs, XC3S250E-CP132,
seed 1), gzipped, and the minimum period ISE 14.7's `trce -a` gives for the same routed design. Silinx's
static timing analysis (core/fpga/timing.js) is checked against those numbers in
test/fpga-timing.test.js (#457). They are Silinx's own XDL files, not ISE's outputs.

| File | Design | Block RAMs, multipliers | trce (ns) |
|---|---|---|---|
| `hard_prim.xdl.gz` | test/fixtures/open-flow/hard_prim | 3 RAMB16 (both ports, three widths), MULT18X18SIO (AREG, PREG), MULT18X18S | 7.147 |
| `mult_reg.xdl.gz` | `mult_reg/top.vhd`: MULT18X18SIOs with input registers and no product register | 2 MULT18X18SIO | 8.722 |
| `stopwatch.xdl.gz` | examples/stopwatch | 1 RAMB16, 3 multipliers | 12.719 |
