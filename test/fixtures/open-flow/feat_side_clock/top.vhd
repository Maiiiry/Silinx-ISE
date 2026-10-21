-- Open-flow check of the side clock pads (#641; an ISE check, not a board test): two clocks on side GCLK pins, K3 on
-- the left and K14 on the right, each on its own side global buffer through its side clock tile's CKIk (the one ISE's
-- placer pairs it with), each clocking a counter.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clka : in  std_logic;
        clkb : in  std_logic;
        q    : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal ca, cb : unsigned(7 downto 0) := (others => '0');
begin
  process (clka) begin if rising_edge(clka) then ca <= ca + 1; end if; end process;
  process (clkb) begin if rising_edge(clkb) then cb <= cb + 3; end if; end process;
  q <= std_logic_vector(ca(7 downto 6)) & std_logic_vector(cb(7 downto 6));
end rtl;
