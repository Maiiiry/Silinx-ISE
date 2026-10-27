library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of bus_bitnames.sch.json (the schematic corpus, #1687, #1688): the wires a(0) and a(3) are those bits of a.
entity bus_bitnames is
  port (a : in std_logic_vector(3 downto 0); y, z : out std_logic);
end bus_bitnames;
architecture ref of bus_bitnames is
begin
  y <= a(0);
  z <= not a(3);
end ref;
