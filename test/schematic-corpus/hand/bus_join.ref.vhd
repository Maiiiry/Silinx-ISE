library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of bus_join.sch.json (the schematic corpus, #1687).
entity bus_join is
  port (a : in std_logic_vector(1 downto 0); b : in std_logic; c : in std_logic_vector(2 downto 0);
        y : out std_logic_vector(5 downto 0); z : out std_logic_vector(6 downto 0); w : out std_logic_vector(2 downto 0));
end bus_join;
architecture ref of bus_join is
begin
  y <= a & b & c;
  z <= a & b & c & b;
  w <= a(0) & b & c(2);
end ref;
