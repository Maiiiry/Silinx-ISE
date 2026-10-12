-- Open-flow board test (Nexys2-500): a DCM whose CLKFX sits at the limit of its frequency range as
-- ISE counts it (#46): the input period declared as 20.9 ns, which ISE takes in whole nanoseconds
-- (20 ns), so CLKFX = CLKIN x 3 / 30 is "5 MHz" and keeps the fast CLKFX range (a period of 21 ns
-- would not). The 50 MHz clock (B8): CLK0 (the feedback) and CLKFX (5 MHz), each on a global buffer,
-- each clocking a 27-bit counter:
--   LD0  CLKFX  (about 13.4 s per on-off cycle)
--   LD1  CLK0   (about 1.3 s)
--   LD7  LOCKED (on when the DCM has locked)
-- sw(0) = 1 holds the counters.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal clkin_b, clk0_u, clk0_b, clkfx_u, clkfx_b, locked : std_logic;
  signal n0, nfx : unsigned(26 downto 0) := (others => '0');
  signal h0, hfx : std_logic := '0';
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);

  u_dcm : DCM_SP
    generic map (
      CLKDV_DIVIDE => 2.0, CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 30, CLKIN_PERIOD => 20.9,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => clkin_b, CLKFB => clk0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => clk0_u, CLK90 => open, CLK180 => open, CLK270 => open, CLK2X => open, CLK2X180 => open,
      CLKDV => open, CLKFX => clkfx_u, CLKFX180 => open, LOCKED => locked, PSDONE => open, STATUS => open);

  u_b0  : BUFG port map (I => clk0_u, O => clk0_b);
  u_bfx : BUFG port map (I => clkfx_u, O => clkfx_b);

  -- (the switch is synchronised to each clock)
  process (clk0_b) begin if rising_edge(clk0_b) then h0 <= sw(0); if h0 = '0' then n0 <= n0 + 1; end if; end if; end process;
  process (clkfx_b) begin if rising_edge(clkfx_b) then hfx <= sw(0); if hfx = '0' then nfx <= nfx + 1; end if; end if; end process;

  led <= locked & "00000" & n0(25) & nfx(25);
end rtl;
