-- ISE check (#709): paths across the XC3S1200E between registers in the IOBs, from pads of the left side to the right
-- and from the top to the bottom, each through one LUT (two inputs from opposite sides): timed, so that the router joins
-- long lines across the centre column and the centre row on the long-line splitters
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
  port (clk : in std_logic;
        l : in std_logic_vector(5 downto 0);
        t : in std_logic_vector(5 downto 0);
        r : out std_logic_vector(5 downto 0);
        b : out std_logic_vector(5 downto 0));
end top;

architecture rtl of top is
  signal lq, tq : std_logic_vector(5 downto 0);
begin
  process (clk) begin
    if rising_edge(clk) then
      lq <= l;
      tq <= t;
      r <= lq xor tq;
      b <= not (lq and tq);
    end if;
  end process;
end rtl;
