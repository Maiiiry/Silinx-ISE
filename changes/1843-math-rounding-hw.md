In short:

- Silinx HLS makes `floor`, `ceil`, `trunc`, `round`, `fmin`, `fmax` and `copysign` of any float or double in hardware.

In detail:

- **math.h's rounding in hardware (#1843):** `floor`, `ceil`, `trunc`, `round` (half away from zero), `fmin`, `fmax`
  and `copysign`, and their float versions (`floorf`, …), of values that are not constants, are functions of the
  soft-float library on the value's bits (a mask of the fraction, the carry into the exponent), so the hardware gives
  the C simulation's bits; checked against the C simulation on the edge cases and random values and co-simulated in
  VHDL and Verilog. In the C simulation, `fmin` and `fmax` of a NaN and a number give the number, as C's, and
  `floorf`, `ceilf`, `truncf`, `fminf`, `fmaxf`, `copysign` and `copysignf` are known.
