library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of net_names.sch.json (the schematic corpus, #1687).
entity net_names is
  port (a, b, c : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0); q : out std_logic);
end net_names;
architecture ref of net_names is
  signal d, yy : std_logic_vector(3 downto 0);
begin
  d <= a xor b;
  yy <= d and c;
  y <= yy;
  q <= d(0) or yy(3);
end ref;
