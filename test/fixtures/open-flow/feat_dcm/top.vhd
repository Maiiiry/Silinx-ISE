-- Open-flow board test (Basys2-250): clocks from the top-left DCM blink the LEDs at their rates.
-- The 50 MHz clock (B8) enters a DCM_SP: CLK0 (50 MHz, the feedback), CLKDV (CLKIN / 4 =
-- 12.5 MHz), CLKFX (CLKIN x 3 / 2 = 75 MHz), CLK2X (100 MHz), each on a global buffer, each
-- clocking a 27-bit counter. Bit 25 of each counter drives an LED:
--   LD0  CLKDV  (blinks slowest: about 5.4 s per on-off cycle)
--   LD1  CLK0   (about 1.3 s)
--   LD2  CLKFX  (about 0.9 s)
--   LD3  CLK2X  (about 0.7 s)
--   LD7  LOCKED (on when the DCM has locked)
-- sw(0) = 1 holds the counters (LD0-LD3 stop).
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
  signal clkin_b, clk0_u, clk0_b, clkdv_u, clkdv_b, clkfx_u, clkfx_b, clk2x_u, clk2x_b, locked : std_logic;
  signal n0, ndv, nfx, n2x : unsigned(26 downto 0) := (others => '0');
  signal h0, hdv, hfx, h2x : std_logic := '0';
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);

  u_dcm : DCM_SP
    generic map (
      CLKDV_DIVIDE => 4.0, CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 2, CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => clkin_b, CLKFB => clk0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => clk0_u, CLK90 => open, CLK180 => open, CLK270 => open, CLK2X => clk2x_u, CLK2X180 => open,
      CLKDV => clkdv_u, CLKFX => clkfx_u, CLKFX180 => open, LOCKED => locked, PSDONE => open, STATUS => open);

  u_b0  : BUFG port map (I => clk0_u, O => clk0_b);
  u_bdv : BUFG port map (I => clkdv_u, O => clkdv_b);
  u_bfx : BUFG port map (I => clkfx_u, O => clkfx_b);
  u_b2x : BUFG port map (I => clk2x_u, O => clk2x_b);

  -- (the switch is synchronised to each clock)
  process (clk0_b) begin if rising_edge(clk0_b) then h0 <= sw(0); if h0 = '0' then n0 <= n0 + 1; end if; end if; end process;
  process (clkdv_b) begin if rising_edge(clkdv_b) then hdv <= sw(0); if hdv = '0' then ndv <= ndv + 1; end if; end if; end process;
  process (clkfx_b) begin if rising_edge(clkfx_b) then hfx <= sw(0); if hfx = '0' then nfx <= nfx + 1; end if; end if; end process;
  process (clk2x_b) begin if rising_edge(clk2x_b) then h2x <= sw(0); if h2x = '0' then n2x <= n2x + 1; end if; end if; end process;

  led <= locked & "000" & n2x(25) & nfx(25) & n0(25) & ndv(25);
end rtl;
