library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of half_adder.sch.json (the schematic corpus, #1687).
entity half_adder is
  port (a, b : in std_logic; s, c : out std_logic);
end half_adder;
architecture ref of half_adder is
begin
  s <= a xor b;
  c <= a and b;
end ref;
