-- Open-flow board test (Basys2-250): a block-RAM ROM of 7-segment patterns scrolls a message
-- across the 4-digit display, one character about every third of a second.
--   sw(0) = 1 stops the scrolling; the LEDs show the scroll position.
-- The ROM (1024 x 8, initial contents from a function) is a RAMB16 of the open synthesis.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(7 downto 0);
        seg : out std_logic_vector(6 downto 0);   -- a..g, active low
        dp  : out std_logic;
        an  : out std_logic_vector(3 downto 0);   -- active low, an(3) = leftmost digit
        led : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  type rom_t is array (0 to 1023) of std_logic_vector(7 downto 0);
  -- segments gfedcba (1 = lit) of "HELLO SILInX 2026 " repeated
  type msg_t is array (0 to 17) of std_logic_vector(7 downto 0);
  constant MSG : msg_t := (
    X"76", X"79", X"38", X"38", X"3F", X"00",              -- H E L L O _
    X"6D", X"06", X"38", X"06", X"54", X"76", X"00",       -- S I L I n X _
    X"5B", X"3F", X"5B", X"7D", X"00");                    -- 2 0 2 6 _
  function init_rom return rom_t is
    variable r : rom_t;
  begin
    for i in 0 to 1023 loop
      r(i) := MSG(i mod 18);
    end loop;
    return r;
  end function;
  signal rom : rom_t := init_rom;
  attribute ram_style : string;
  attribute ram_style of rom : signal is "block";

  signal cnt  : unsigned(23 downto 0) := (others => '0');
  signal pos  : unsigned(9 downto 0) := (others => '0');
  signal q    : std_logic_vector(7 downto 0) := (others => '0');
  signal digit : unsigned(1 downto 0);
  signal addr : unsigned(9 downto 0);
  signal an_r : std_logic_vector(3 downto 0) := "1111";
begin
  digit <= cnt(16 downto 15);
  -- digit 3 (leftmost) shows the character at pos, digit 0 the one at pos + 3
  addr <= pos + 3 - resize(digit, 10);

  process (clk)
  begin
    if rising_edge(clk) then
      cnt <= cnt + 1;
      if cnt = X"FFFFFF" and sw(0) = '0' then
        pos <= pos + 1;
      end if;
      q <= rom(to_integer(addr));
      case digit is
        when "00" => an_r <= "1110";
        when "01" => an_r <= "1101";
        when "10" => an_r <= "1011";
        when others => an_r <= "0111";
      end case;
    end if;
  end process;

  seg <= not q(6 downto 0);
  dp  <= '1';
  an  <= an_r;
  led <= std_logic_vector(pos(7 downto 0));
end rtl;
