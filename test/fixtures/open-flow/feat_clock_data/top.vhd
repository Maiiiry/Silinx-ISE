-- ISE check (#957): a global clock and a DCM output read as data in the logic (CLKT_GCLK_MAINk -> CLKT_TO_OMUXj,
-- DCM_CLK0 -> OMUXk into general routing)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
entity top is
  port (clk : in std_logic; d : in std_logic_vector(1 downto 0); q : out std_logic_vector(1 downto 0));
end top;
architecture rtl of top is
  signal ci, g, c0, c0b : std_logic;
  signal r : std_logic := '0';
begin
  u_ib : IBUFG port map (I => clk, O => ci);
  u_dcm : DCM_SP generic map (CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X")
    port map (CLKIN => ci, CLKFB => c0b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0', CLK0 => c0);
  u_bg : BUFG port map (I => c0, O => c0b);
  process (c0b) begin if rising_edge(c0b) then r <= d(0); end if; end process;
  -- the global clock and the DCM's output read as data
  q(0) <= r xor c0b;
  q(1) <= d(1) and c0;
end rtl;
