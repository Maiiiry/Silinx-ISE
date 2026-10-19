-- Board test (#96): registers in the IOBs. sw(0) through an input register (clock enable sw(3), reset
-- btn(0)) is led(0) through an output register (with sw(1)); led(1) a tristate output: its value and its
-- enable (sw(2) = 1 releases the pad, the LED off) each from a register in the IOB.
library ieee;
use ieee.std_logic_1164.all;
entity top is
  port (clk : in std_logic; btn : in std_logic_vector(0 downto 0); sw : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(1 downto 0));
end top;
architecture rtl of top is
  signal ra, rq, rt, rz : std_logic;
begin
  process (clk) begin
    if rising_edge(clk) then
      if btn(0) = '1' then ra <= '0'; rq <= '0'; rt <= '1'; rz <= '0';
      elsif sw(3) = '1' then ra <= sw(0); rq <= ra xor sw(1); rt <= sw(2); rz <= ra;
      end if;
    end if;
  end process;
  led(0) <= rq;
  led(1) <= rz when rt = '0' else 'Z';
end rtl;
