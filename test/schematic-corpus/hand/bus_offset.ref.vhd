library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of bus_offset.sch.json (the schematic corpus, #1687, #1689): d(7:4) is a, its bit 7 a's bit 3.
entity bus_offset is
  port (a : in std_logic_vector(3 downto 0); y : out std_logic);
end bus_offset;
architecture ref of bus_offset is
begin
  y <= a(3);
end ref;
