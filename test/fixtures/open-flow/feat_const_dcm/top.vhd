-- Open-flow check of a DCM whose inputs are tied to constants (ISE check, not a board test; #50):
-- RST, PSCLK and PSINCDEC tied to 1, PSEN to 0, DSSEN to 1. ISE ties the pins tied to 1 to the
-- VCC site of the DCM's tile (#190), the pins tied to 0 to GND, and leaves DSSEN open. (PSEN tied
-- to 1 without a variable phase shift: ISE's DRC warns, PhysDesignRules:774, in ISE's own flow too.)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        s   : in  std_logic_vector(3 downto 0);
        y   : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal clkin_b, clk0_u, clk0_b, locked : std_logic;
  signal n0 : unsigned(6 downto 0) := (others => '0');
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);
  u_dcm : DCM_SP
    generic map (CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X", CLKOUT_PHASE_SHIFT => "NONE")
    port map (CLKIN => clkin_b, CLKFB => clk0_b, RST => '1', DSSEN => '1', PSCLK => '1', PSEN => '0', PSINCDEC => '1',
              CLK0 => clk0_u, LOCKED => locked);
  u_b0 : BUFG port map (I => clk0_u, O => clk0_b);
  process (clk0_b) begin if rising_edge(clk0_b) then if s(0) = '0' then n0 <= n0 + 1; end if; end if; end process;
  y <= locked & std_logic_vector(n0);
end rtl;
