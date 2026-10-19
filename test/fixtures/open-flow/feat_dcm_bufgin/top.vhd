-- Open-flow board test (Basys2-250): a DCM whose CLKIN comes from a global buffer that the clock pad
-- drives (#94). The 50 MHz clock (B8) enters a BUFG, whose net clocks a counter and the DCM's CLKIN:
-- CLK0 (50 MHz, the feedback) and CLKFX (CLKIN x 3 / 2 = 75 MHz), each on a global buffer, each
-- clocking a 27-bit counter. Bit 25 of each counter drives an LED:
--   LD0  the pad's buffer (about 1.3 s per on-off cycle)
--   LD1  CLK0             (about 1.3 s)
--   LD2  CLKFX            (about 0.9 s)
--   LD7  LOCKED (on when the DCM has locked)
-- sw(0) = 1 holds the counters (LD0-LD2 stop).
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
  signal clk_b, clk0_u, clk0_b, clkfx_u, clkfx_b, locked : std_logic;
  signal ni, n0, nfx : unsigned(26 downto 0) := (others => '0');
  signal hi, h0, hfx : std_logic := '0';
begin
  u_bin : BUFG port map (I => clk, O => clk_b);

  u_dcm : DCM_SP
    generic map (
      CLKDV_DIVIDE => 2.0, CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 2, CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => clk_b, CLKFB => clk0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => clk0_u, CLK90 => open, CLK180 => open, CLK270 => open, CLK2X => open, CLK2X180 => open,
      CLKDV => open, CLKFX => clkfx_u, CLKFX180 => open, LOCKED => locked, PSDONE => open, STATUS => open);

  u_b0  : BUFG port map (I => clk0_u, O => clk0_b);
  u_bfx : BUFG port map (I => clkfx_u, O => clkfx_b);

  -- (the switch is synchronised to each clock)
  process (clk_b) begin if rising_edge(clk_b) then hi <= sw(0); if hi = '0' then ni <= ni + 1; end if; end if; end process;
  process (clk0_b) begin if rising_edge(clk0_b) then h0 <= sw(0); if h0 = '0' then n0 <= n0 + 1; end if; end if; end process;
  process (clkfx_b) begin if rising_edge(clkfx_b) then hfx <= sw(0); if hfx = '0' then nfx <= nfx + 1; end if; end if; end process;

  led <= locked & "0000" & nfx(25) & n0(25) & ni(25);
end rtl;
