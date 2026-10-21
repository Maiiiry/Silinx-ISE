-- Board test (#751): input registers in the IOBs of pads whose neighbouring pad is unused. #44 / #97 measured the input
-- delays in designs where every pad had an input, so a bit of the delay ISE's map chooses went to both pads of a pair:
-- B3's register set A3's 46,31 (47,31 on the XC3S1200E), E17's on the XC3S500E D18's 538,356, F14's and G13's on the
-- XC3S1200E the bits of E17 and E18 (the input-only pads above them). Here each of them alone, its neighbours unused;
-- d(3:0) through the registers, their parity on LD0 (the LED follows the four inputs).
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
  port (clk : in std_logic;
        d   : in std_logic_vector(3 downto 0);
        led : out std_logic);
end top;

architecture rtl of top is
  signal r : std_logic_vector(3 downto 0) := (others => '0');
  signal p : std_logic := '0';
begin
  process (clk) begin
    if rising_edge(clk) then
      r <= d;
      p <= r(0) xor r(1) xor r(2) xor r(3);
    end if;
  end process;
  led <= p;
end rtl;
