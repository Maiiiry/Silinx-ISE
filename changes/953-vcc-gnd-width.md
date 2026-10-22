In short:

- Schematics: VCC and GND have a Width in the Properties panel; a VCC or GND of 8 bits ties a whole bus to 1s or 0s.

In detail:

- **VCC and GND with a Width (#953):** a parameter like the other symbols' widths, 1 for a new symbol; the output pin a
  bus of that width (its width drawn by it), checked against its net with the usual `width mismatch` error; generated
  as `(others => '1')` / `(others => '0')` in VHDL and `{N{1'b1}}` / `{N{1'b0}}` in Verilog, and simulated in place.
  A VCC / GND saved before has no Width and keeps taking its net's width (the panel says so), its HDL unchanged.
  ISE .sch export: a VCC / GND wider than a bit, exported as a constant symbol, now has the constant's output pin `O`,
  so it is read back connected.
