library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of the gates example's schematic (the schematic corpus, #1687): both LEDs light for a prime.
entity gates is
  port (sw : in std_logic_vector(3 downto 0); led : out std_logic_vector(1 downto 0));
end gates;
architecture ref of gates is
  signal p : std_logic;
begin
  with to_integer(unsigned(sw)) select p <= '1' when 2 | 3 | 5 | 7 | 11 | 13, '0' when others;
  led <= p & p;
end ref;
