-- Open-flow board test (Nexys2-1200): two DCMs, each with its CLKIN on the dedicated path from a clock pad
-- of its own (#92): DCM A from the 50 MHz oscillator (B8, the top-left DCM's path), DCM B from the board's
-- clock socket (U9: the bottom-left DCM's path; nothing blinks on LD2-LD3 without an oscillator in the
-- socket). Each DCM's CLK0 (its feedback) and CLKFX (x 1 / 2) on global buffers clock 27-bit counters;
-- bit 25 of each drives an LED:
--   LD0  A.CLK0   (about 1.3 s per on-off cycle at 50 MHz)
--   LD1  A.CLKFX  (about 2.7 s)
--   LD2  B.CLK0, LD3 B.CLKFX (the socket's frequency)
--   LD6  B.LOCKED, LD7 A.LOCKED (on when locked)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk  : in  std_logic;
        sclk : in  std_logic;
        led  : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal ina, inb, a0_u, a0_b, afx_u, afx_b, alocked, b0_u, b0_b, bfx_u, bfx_b, blocked : std_logic;
  signal na0, nafx, nb0, nbfx : unsigned(26 downto 0) := (others => '0');
begin
  u_iba : IBUFG port map (I => clk, O => ina);
  u_ibb : IBUFG port map (I => sclk, O => inb);

  u_dcma : DCM_SP
    generic map (CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 4, CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (CLKIN => ina, CLKFB => a0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => a0_u, CLKFX => afx_u, LOCKED => alocked);
  u_ba0  : BUFG port map (I => a0_u, O => a0_b);
  u_bafx : BUFG port map (I => afx_u, O => afx_b);

  u_dcmb : DCM_SP
    generic map (CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 4, CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (CLKIN => inb, CLKFB => b0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => b0_u, CLKFX => bfx_u, LOCKED => blocked);
  u_bb0  : BUFG port map (I => b0_u, O => b0_b);
  u_bbfx : BUFG port map (I => bfx_u, O => bfx_b);

  process (a0_b) begin if rising_edge(a0_b) then na0 <= na0 + 1; end if; end process;
  process (afx_b) begin if rising_edge(afx_b) then nafx <= nafx + 1; end if; end process;
  process (b0_b) begin if rising_edge(b0_b) then nb0 <= nb0 + 1; end if; end process;
  process (bfx_b) begin if rising_edge(bfx_b) then nbfx <= nbfx + 1; end if; end process;

  led <= alocked & blocked & "00" & nbfx(25) & nb0(25) & nafx(25) & na0(25);
end rtl;
