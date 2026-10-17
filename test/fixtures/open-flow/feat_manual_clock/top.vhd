-- Board test (#347): a manual clock. A D flip-flop clocked by a push button (BTN0 on the Basys2, not a
-- clock pin: CLOCK_DEDICATED_ROUTE = FALSE in the UCF): LD0 takes SW0 at each press of BTN0, and only then.
library ieee;
use ieee.std_logic_1164.all;

entity top is
  port (
    clk : in  std_logic;   -- BTN0
    d   : in  std_logic;   -- SW0
    q   : out std_logic    -- LD0
  );
end entity top;

architecture rtl of top is
begin
  process (clk)
  begin
    if rising_edge(clk) then
      q <= d;
    end if;
  end process;
end architecture rtl;
