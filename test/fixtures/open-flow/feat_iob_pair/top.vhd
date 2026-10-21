-- Open-flow test (#749): registers in the IOBs on two global clocks, the 50 MHz clock (B8) and a counter's bit 20 on a
-- global buffer of its own: sw(0) and sw(1) through input registers, one on each clock; led(0) and led(1) from output
-- registers, one on each (each a switch's register XOR a counter bit). The two IOBs of a differential pair share each
-- clock wire of their I/O tile: the placer keeps the two input registers, and the two output registers, out of one
-- pair (the pads are not LOC'd). With LOCs on one pair, ISE puts the DIFFM's register on its second flip-flop.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(1 downto 0);
        led : out std_logic_vector(1 downto 0));
end top;

architecture rtl of top is
  signal ck0, ck1 : std_logic;
  signal base : unsigned(23 downto 0) := (others => '0');
  signal r, q : std_logic_vector(1 downto 0) := (others => '0');
begin
  u_b0 : BUFG port map (I => clk, O => ck0);
  process (ck0) begin if rising_edge(ck0) then base <= base + 1; end if; end process;
  u_b1 : BUFG port map (I => base(20), O => ck1);
  process (ck0) begin if rising_edge(ck0) then r(0) <= sw(0); q(0) <= r(0) xor base(23); end if; end process;
  process (ck1) begin if rising_edge(ck1) then r(1) <= sw(1); q(1) <= r(1) xor base(22); end if; end process;
  led <= q;
end rtl;
