library ieee;
use ieee.std_logic_1164.all;
-- The reference of the ISE fixture MyAND2b4.sch (the schematic corpus, #1687): a 4-bit AND through bus taps.
entity MyAND2b4 is
  port (A, B : in std_logic_vector(3 downto 0); C : out std_logic_vector(3 downto 0));
end MyAND2b4;
architecture ref of MyAND2b4 is
begin
  C <= A and B;
end ref;
