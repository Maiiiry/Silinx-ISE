library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of curved_hops.sch.json (the schematic corpus, #1687): the crossing wires stay apart.
entity curved_hops is
  port (a, b : in std_logic; y1, y2 : out std_logic);
end curved_hops;
architecture ref of curved_hops is
begin
  y1 <= not a;
  y2 <= not b;
end ref;
