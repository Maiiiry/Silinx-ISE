library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of full_adder.sch.json (the schematic corpus, #1687).
entity full_adder is
  port (a, b, ci : in std_logic; s, co : out std_logic);
end full_adder;
architecture ref of full_adder is
begin
  s <= a xor b xor ci;
  co <= (a and b) or (ci and (a xor b));
end ref;
