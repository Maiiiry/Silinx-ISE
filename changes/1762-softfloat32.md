In detail:

- **A soft-float library (#1762, step 1 of #1761):** core/c-softfloat.js: IEEE-754 binary32 add, sub, mul, the
  comparisons and the conversions to and from int / unsigned, in the C Silinx HLS synthesizes (integers, constant
  loops), on the values' bits, rounded to nearest even with subnormals, infinities and a NaN as the C simulation's;
  checked through the C simulation against IEEE on every pair of edge cases and 2600 random ones, and synthesized
  and co-simulated in VHDL and Verilog. The floating point of synthesized code calls it next (#1761).
