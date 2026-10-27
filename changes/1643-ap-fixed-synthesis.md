In short:

- **Silinx HLS: `ap_fixed` in hardware**: filters, square roots and the like with fixed-point types synthesize, their
  rounding and saturation as AMD's; two more of AMD's examples go through every stage (19 of 73).

In detail:

- **ap_fixed synthesized (#1643):** core/c-dataflow-fixed.js: a fixed value its raw bits; operations aligned to AMD's
  result types, conversions with the quantization's rounding and the overflow's saturation as logic, comparisons as
  AMD's (with a double constant: exactly), constants of doubles as an ap_fixed's value (registers and ROMs too),
  `x.range(hi, lo) = v`, an ap_fixed's range an unsigned long long in an expression (AMD's); co-simulated on programs
  and random functions, their C simulation AMD's.
- **C++ (#1643):** integer template parameters deduced from an argument's type (`ap_ufixed<W, I> &x`), `double(x)` /
  `float(x)`, `(T(x) << 2)`; `assert` (`assert.h`, `cassert`): checked by the C simulation, ignored by synthesis with a
  warning; the test bench's `rand` / `srand`; a shift by a negative constant in a branch a constant condition never
  runs no longer refused.
