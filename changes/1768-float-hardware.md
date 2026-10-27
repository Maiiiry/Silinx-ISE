In short:

- **Silinx HLS: `float` in hardware**: a synthesized function's float variables, arguments, arrays and results, `+ - *`,
  the comparisons and the conversions, each a circuit giving the C simulation's bits exactly.

In detail:

- **float in synthesis (#1768, step 2 of #1761):** core/c-dataflow-float.js: a float value is its IEEE-754 bits (32-bit
  ports and memories), each operation (`+ - *`, the comparisons, `?:`, `-x`, `!x`, casts to and from the integers) a
  call of the soft-float library (#1762, now with one return per function so that its loops unroll in any module),
  inlined where it is; a double constant converted to a float is its value, in an operation it must be written as a
  float (`0.5f`), or be held exactly in a comparison. The co-simulation gives and compares the C simulation's floats as
  their bits. Double, a float division and `math.h` are said not made yet. The hint of the message says so.
