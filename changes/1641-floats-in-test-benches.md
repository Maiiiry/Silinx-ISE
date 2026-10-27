In short:

- **Silinx HLS: `float` and `double` in test benches** (the C simulation), printed as C and C++ print them; still
  refused in hardware.

In detail:

- **Floating point in the C simulation (#1641):** core/c-float.js: float and double values, literals (`1.5e-3`, `2.0f`),
  C's arithmetic and conversions (to an integer toward zero, to float rounded), `math.h`'s functions; `printf`'s `%f`
  `%e` `%g` (flags, widths, precisions) exactly as C's library prints them (the double's exact value, ties to even);
  C++'s `cout` of a double (`%g`, 6 digits) with the stream's state (`fixed`, `scientific`, `setprecision`, `hex`,
  `left`, `setfill`) kept from one statement to the next, chars as characters, wide `ap_uint` whole; `ap_int`'s
  `to_double()` / `to_float()`. In hardware still refused (`sqrt` named).
