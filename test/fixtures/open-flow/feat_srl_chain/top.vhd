-- Open-flow board test (Basys2-250): delay lines of SRLC16E chained through Q15 (#2), each stage read at
-- a tap chosen by the switches. btn[0] enters a 64-stage line (four SRLC16E: the two SLICEMs of a CLB),
-- btn[1] a 48-stage one (three), clocked at about 6 Hz:
--   led[3:0] : the four stages of the first line, each read at sw[3:0] (LED k: 16k + sw[3:0] ticks late)
--   led[6:4] : the three stages of the second line, each read at sw[7:4]
--   led[7]   : btn[0] itself
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(7 downto 0);
        btn : in  std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal cnt : unsigned(22 downto 0) := (others => '0');
  signal tick : std_logic := '0';
  signal b : std_logic_vector(1 downto 0) := "00";
  signal ca : std_logic_vector(3 downto 0);
  signal cb : std_logic_vector(2 downto 0);
  signal da : std_logic_vector(3 downto 0);
  signal db : std_logic_vector(2 downto 0);
begin
  process (clk)
  begin
    if rising_edge(clk) then
      cnt <= cnt + 1;
      if cnt = 0 then tick <= '1'; else tick <= '0'; end if;
      b <= btn(1 downto 0);
    end if;
  end process;

  -- the first line: ua0 .. ua3, each one's Q15 into the next one's D
  la : for k in 0 to 3 generate
    u : SRLC16E generic map (INIT => X"0000")
      port map (D => da(k), CE => tick, CLK => clk, A0 => sw(0), A1 => sw(1), A2 => sw(2), A3 => sw(3), Q => led(k), Q15 => ca(k));
  end generate;
  da <= ca(2 downto 0) & b(0);
  -- the second line: ub0 .. ub2 (the last one's Q15 unused)
  lb : for k in 0 to 2 generate
    u : SRLC16E generic map (INIT => X"0000")
      port map (D => db(k), CE => tick, CLK => clk, A0 => sw(4), A1 => sw(5), A2 => sw(6), A3 => sw(7), Q => led(4 + k), Q15 => cb(k));
  end generate;
  db <= cb(1 downto 0) & b(1);
  led(7) <= b(0);
end rtl;
