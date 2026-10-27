library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of bus_taps_turned.sch.json (the schematic corpus, #1687).
entity bus_taps_turned is
  port (a : in std_logic_vector(4 downto 0); y : out std_logic_vector(4 downto 0));
end bus_taps_turned;
architecture ref of bus_taps_turned is
begin
  y <= a;
end ref;
