In detail:

- **Convert to Schematic: a port of width 0 (#1717):** a VHDL port whose range is null with its generics'
  defaults (`std_logic_vector(natural(ceil(log2(real(N))))-1 downto 0)`, N = 1) is drawn as a marker of width 1,
  the width a saved schematic keeps, its type written as the entity has it: the schematic is saved as it was
  made, and its HDL is the same.
