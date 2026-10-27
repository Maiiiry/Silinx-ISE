library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of vcc_gnd.sch.json (the schematic corpus, #1687).
entity vcc_gnd is
  port (a : in std_logic_vector(3 downto 0); one, zero : out std_logic;
        ones, k, s, y : out std_logic_vector(3 downto 0));
end vcc_gnd;
architecture ref of vcc_gnd is
begin
  one <= '1';
  zero <= '0';
  ones <= "1111";
  k <= "1010";
  s <= std_logic_vector(unsigned(a) + 3);
  y <= a(3 downto 2) & "00";
end ref;
