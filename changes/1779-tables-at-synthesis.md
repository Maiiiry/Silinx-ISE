In short:

- **Silinx HLS: a table computed at synthesis**: a function that fills an array from constants (`sin`, `cos`, `round`,
  float arithmetic) makes a ROM of the C simulation's values, as Vitis HLS does; two more of AMD's examples pass
  (44 of 73).

In detail:

- **Tables at synthesis (#1779, step 4a of #1761):** core/c-const-init.js: a call of a function that only writes its array
  arguments from constants (it reads no argument, no global but a constant, calls only math.h) is run by the C
  simulation at synthesis (core/c-interp.js's runAtSynthesis), its values the arrays' initial ones (constant: a ROM);
  math.h's functions and a floating-point division of constants are folded (core/c-dataflow-float.js); of other
  values they are said not made yet, by the synthesis (the check no longer refuses math.h in a synthesized function).
  AMD's coefficient_filter and rom_lookup_table_math pass.
