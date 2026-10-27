library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of arith.sch.json (the schematic corpus, #1687): the borrow out BO is 1 when A < B.
entity arith is
  port (a, b : in std_logic_vector(3 downto 0); ci : in std_logic; s : out std_logic_vector(3 downto 0); co : out std_logic;
        df : out std_logic_vector(3 downto 0); bo, eq, lt, ges : out std_logic);
end arith;
architecture ref of arith is
  signal sum : unsigned(4 downto 0);
begin
  sum <= ('0' & unsigned(a)) + ('0' & unsigned(b)) + (0 => ci);
  s <= std_logic_vector(sum(3 downto 0));
  co <= sum(4);
  df <= std_logic_vector(unsigned(a) - unsigned(b));
  bo <= '1' when unsigned(a) < unsigned(b) else '0';
  eq <= '1' when a = b else '0';
  lt <= '1' when unsigned(a) < unsigned(b) else '0';
  ges <= '1' when signed(a) >= signed(b) else '0';
end ref;
