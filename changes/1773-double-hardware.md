In short:

- **Silinx HLS: `double` in hardware** too, and a double constant in an operation (`x * 0.5`), as C computes it.

In detail:

- **double in synthesis (#1773, step 3 of #1761):** core/c-softfloat.js makes the binary64 library from the binary32 one's
  source (its widths its parameters; the 106-bit product from 32-bit halves), with float <-> double; checked against
  IEEE on every pair of edge cases and 1100 random ones. core/c-dataflow-float.js: C's usual conversions (a double
  operand or constant a double operation), 64-bit ports and memories, a double constant converted to an integer
  folded. The C compilers of the tests' references run with -ffp-contract=off (a * b + c rounded twice, as C's abstract
  machine and the C simulation; clang on arm64 fuses them by default). The hint of the floating-point message now
  says what is not made yet: a division and math.h.
