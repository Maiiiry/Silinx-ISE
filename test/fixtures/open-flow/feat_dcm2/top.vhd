-- Open-flow board test (Basys2-250): two DCMs, cascaded (#47). The 50 MHz clock (B8) enters DCM A
-- (its CLKIN on the pad's dedicated path): CLK0 (50 MHz, the feedback) and CLKFX (x 1 / 4 =
-- 12.5 MHz; CLKDV of the top-left DCM reaches on known switches only the buffer its CLK0 needs
-- to reach B's CLKIN). DCM B takes A's CLK0 from its global buffer: CLK0 (50 MHz, its feedback),
-- CLKFX (x 3 / 2 = 75 MHz) and CLK2X180 (100 MHz, inverted: on the XC3S250E only the bottom-left DCM
-- reaches a global buffer from CLK2X180 on switches of known bits, so B goes there). Each output on
-- a global buffer clocks a 27-bit counter; bit 25 of each drives an LED:
--   LD0  A.CLKFX     (about 5.4 s per on-off cycle)
--   LD1  A.CLK0      (about 1.3 s)
--   LD2  B.CLK0      (about 1.3 s)
--   LD3  B.CLKFX     (about 0.9 s)
--   LD4  B.CLK2X180  (about 0.7 s)
--   LD6  B.LOCKED, LD7 A.LOCKED (on when locked)
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
  signal clkin_b, a0_u, a0_b, afx_u, afx_b, alocked : std_logic;
  signal b0_u, b0_b, bfx_u, bfx_b, b2x_u, b2x_b, blocked : std_logic;
  signal na0, nafx, nb0, nbfx, nb2x : unsigned(26 downto 0) := (others => '0');
  signal ha0, hafx, hb0, hbfx, hb2x : std_logic := '0';
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);

  u_dcma : DCM_SP
    generic map (
      CLKDV_DIVIDE => 2.0, CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 8, CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => clkin_b, CLKFB => a0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => a0_u, CLK90 => open, CLK180 => open, CLK270 => open, CLK2X => open, CLK2X180 => open,
      CLKDV => open, CLKFX => afx_u, CLKFX180 => open, LOCKED => alocked, PSDONE => open, STATUS => open);

  u_ba0  : BUFG port map (I => a0_u, O => a0_b);
  u_bafx : BUFG port map (I => afx_u, O => afx_b);

  u_dcmb : DCM_SP
    generic map (
      CLKDV_DIVIDE => 2.0, CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 2, CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => a0_b, CLKFB => b0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => b0_u, CLK90 => open, CLK180 => open, CLK270 => open, CLK2X => open, CLK2X180 => b2x_u,
      CLKDV => open, CLKFX => bfx_u, CLKFX180 => open, LOCKED => blocked, PSDONE => open, STATUS => open);

  u_bb0  : BUFG port map (I => b0_u, O => b0_b);
  u_bbfx : BUFG port map (I => bfx_u, O => bfx_b);
  u_bb2x : BUFG port map (I => b2x_u, O => b2x_b);

  -- (the switch is synchronised to each clock)
  process (a0_b) begin if rising_edge(a0_b) then ha0 <= sw(0); if ha0 = '0' then na0 <= na0 + 1; end if; end if; end process;
  process (afx_b) begin if rising_edge(afx_b) then hafx <= sw(0); if hafx = '0' then nafx <= nafx + 1; end if; end if; end process;
  process (b0_b) begin if rising_edge(b0_b) then hb0 <= sw(0); if hb0 = '0' then nb0 <= nb0 + 1; end if; end if; end process;
  process (bfx_b) begin if rising_edge(bfx_b) then hbfx <= sw(0); if hbfx = '0' then nbfx <= nbfx + 1; end if; end if; end process;
  process (b2x_b) begin if rising_edge(b2x_b) then hb2x <= sw(0); if hb2x = '0' then nb2x <= nb2x + 1; end if; end if; end process;

  led <= alocked & blocked & '0' & nb2x(25) & nbfx(25) & nb0(25) & na0(25) & nafx(25);
end rtl;
