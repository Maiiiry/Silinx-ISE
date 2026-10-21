-- Open-flow test (#96): bidirectional pads (IOBUF). io(0) driven with a register's value while sw(0) is 1, io(1) with
-- sw(1) while sw(0) is 0; the register captures io(1) on the 50 MHz clock (B8); led(0) shows io(0), led(1) io(1) xor
-- the register.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
  port (clk : in    std_logic;
        sw  : in    std_logic_vector(1 downto 0);
        io  : inout std_logic_vector(1 downto 0);
        led : out   std_logic_vector(1 downto 0));
end top;

architecture rtl of top is
  signal r : std_logic := '0';
begin
  process (clk) begin if rising_edge(clk) then r <= io(1); end if; end process;
  io(0) <= r when sw(0) = '1' else 'Z';
  io(1) <= sw(1) when sw(0) = '0' else 'Z';
  led(0) <= io(0);
  led(1) <= io(1) xor r;
end rtl;
