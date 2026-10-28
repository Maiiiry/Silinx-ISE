In short:

- **Silinx HLS: a floating-point division, `sqrt` and `fabs` in hardware**, float and double.

In detail:

- **Division and sqrt (#1783, step 4b of #1761):** core/c-softfloat.js: the division (restoring, a quotient bit a step, its
  remainder the sticky bit) and the square root (digit by digit) of binary32 and binary64, correctly rounded, with
  their special cases; checked against IEEE (JavaScript's / and Math.sqrt) on every pair of edge cases and the random
  ones. core/c-dataflow-float.js: `x / y`, `sqrt`, `sqrtf` of any value the library's, `fabs`, `fabsf` the sign
  cleared; math.h's other functions of values that are not constants are still said not made.
