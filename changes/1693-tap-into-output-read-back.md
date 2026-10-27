In detail:

- **A 1-bit bus tap into an output read back (#1693):** a tap of one bit whose output is an output marker also read
  inside the schematic wrote `msb_int <= a(7 downto 7);` (a vector into a `std_logic`): the VHDL did not compile in
  Check Syntax. It now takes the bit, `msb_int <= a(7);`.
