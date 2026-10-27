library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of bus_taps.sch.json (the schematic corpus, #1687): its behaviour, written independently.
entity bus_taps is
  port (a : in std_logic_vector(7 downto 0); msb : out std_logic; mid : out std_logic_vector(3 downto 0);
        rev : out std_logic_vector(3 downto 0); nb4 : out std_logic; ends : out std_logic);
end bus_taps;
architecture ref of bus_taps is
begin
  msb <= a(7);
  mid <= a(5 downto 2);
  rev <= a(0) & a(1) & a(2) & a(3);
  nb4 <= not a(4);
  ends <= a(7) and a(0);
end ref;
