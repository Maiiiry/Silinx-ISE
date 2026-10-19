-- Open-flow board test (Basys2-250): twelve global clocks, more than the eight top / bottom buffers
-- (#95): the side buffers take the others, each on line k of its half of the chip, the top / bottom
-- buffer of the same line kept out of that half. The 50 MHz clock (B8) on a global buffer clocks a
-- 27-bit counter; its bits 1 to 11 are eleven more clocks (25 MHz down to about 24 kHz), each on a
-- global buffer, each clocking a 16-bit counter. The LEDs show the top bits:
--   LD0-LD7  the counters of clocks 4 to 11 (blinking about 1.4 s to 2.7 min per cycle), LD0-LD3
--            XORed with those of clocks 0 to 3
-- sw(0) = 1 holds the counters.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(7 downto 0);
        led : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal clk_b : std_logic;
  signal ck, ck_b, msb : std_logic_vector(11 downto 0) := (others => '0');
  signal base : unsigned(26 downto 0) := (others => '0');
begin
  u_bin : BUFG port map (I => clk, O => clk_b);
  process (clk_b) begin if rising_edge(clk_b) then base <= base + 1; end if; end process;
  ck(0) <= base(26);
  gen_ck : for k in 1 to 11 generate
    ck(k) <= base(k);
  end generate;
  gen_dom : for k in 0 to 11 generate
    signal n : unsigned(15 downto 0) := (others => '0');
    signal hold : std_logic := '0';
  begin
    u_b : BUFG port map (I => ck(k), O => ck_b(k));
    -- (the switch is synchronised to each clock)
    process (ck_b(k)) begin
      if rising_edge(ck_b(k)) then
        hold <= sw(0);
        if hold = '0' then n <= n + 1; end if;
      end if;
    end process;
    msb(k) <= n(15);
  end generate;
  gen_led : for i in 0 to 7 generate
    lo : if i < 4 generate led(i) <= msb(i + 4) xor msb(i); end generate;
    hi : if i >= 4 generate led(i) <= msb(i + 4); end generate;
  end generate;
end rtl;
