In short:

- **Schematic ENCODER:** a new ENCODER is a priority encoder (PENC4_2): with several inputs at 1, A is the index of
  the highest one. One-hot stays a choice of its Type; encoders already in a schematic keep theirs.

In detail:

- **ENCODER placed as a priority encoder (#1553):** the symbol's Type defaults to priority (the highest index wins, V
  = some input is 1) instead of one-hot; an ENCODER saved without a Type (from before) stays one-hot. Tested on every
  input pattern of the 4- and 8-input encoders, VHDL and Verilog, against an independent reference.
