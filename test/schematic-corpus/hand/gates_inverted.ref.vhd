library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of gates_inverted.sch.json (the schematic corpus, #1687): Xilinx's ANDnBk inverts I0 .. I(k-1).
entity gates_inverted is
  port (a, b, c, e : in std_logic; v, w : in std_logic_vector(2 downto 0);
        y0, y1, y2, y3, y4, y5, y6, y7, y8 : out std_logic; vw : out std_logic_vector(2 downto 0));
end gates_inverted;
architecture ref of gates_inverted is
  signal t0 : std_logic;
begin
  t0 <= (not a) and b;
  y0 <= t0;
  y1 <= (not a) or (not b) or c;
  y2 <= not ((not a) and b and c);
  y3 <= not (a or e);
  y4 <= a xor b xor c;
  y5 <= not (c xor e);
  y6 <= (not a) and (not b) and c and e;
  y7 <= a or b or c or e or t0;
  y8 <= not (a or e);
  vw <= v nand w;
end ref;
