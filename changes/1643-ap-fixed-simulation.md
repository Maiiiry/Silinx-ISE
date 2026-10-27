In short:

- **Silinx HLS: `ap_fixed` and `ap_ufixed`** in the C simulation, as AMD's `ap_fixed.h` computes them (not
  synthesized yet).

In detail:

- **ap_fixed in the C simulation (#1643):** core/c-fixed.js: `ap_fixed<W, I, Q, O>` / `ap_ufixed` values (their raw
  bits), the types of the results as AMD's RType, the seven quantization and four overflow modes of a conversion,
  conversions from doubles (exactly) and integers, to integers (toward zero) and doubles, comparisons as AMD's
  ap_private compares mixed signs, shifts, `to_double()` / `to_int()`, C++'s `cout` of a value (its exact decimal
  reduced to the stream's precision); compared with AMD's headers on a program and on random types, modes and
  operators. C++'s `T(x)` of a typedef's name a cast. In a synthesized function: said, not synthesized yet.
