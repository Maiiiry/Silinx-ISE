-- Open-flow board test (Basys2-250): paths between phase-shifted clocks of one DCM (#601). The 50 MHz clock (B8)
-- enters a DCM_SP with a fixed phase shift (PHASE_SHIFT 32: 32 / 256 of the period, 2.5 ns, on every output):
-- CLK0 (the feedback), CLK90 and CLK180, each on a global buffer. An 8-bit counter on CLK0 is passed, through an
-- adder at each step, to CLK90, back to CLK0, to CLK180 and back to CLK0, as ISE's trce times such paths: against
-- the time between the two clocks' edges (CLK0 into CLK90: 5 ns, CLK90 into CLK0: 15 ns, CLK180 into CLK0: 10 ns).
--   LD0-LD5  the last step's low bits (CLK0), changing too fast to see blink
--   LD6      bit 25 of the counter (about 1.3 s per on-off cycle)
--   LD7      LOCKED (on when the DCM has locked)
-- sw(0) = 1 holds the counter.
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
  signal clkin_b, clk0_u, clk0_b, clk90_u, clk90_b, clk180_u, clk180_b, locked : std_logic;
  signal n0 : unsigned(26 downto 0) := (others => '0');
  signal s0, a0, b90, c0, d180, e0 : unsigned(7 downto 0) := (others => '0');
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);

  u_dcm : DCM_SP
    generic map (
      CLKDV_DIVIDE => 2.0, CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 1, CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "FIXED", PHASE_SHIFT => 32,
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => clkin_b, CLKFB => clk0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => clk0_u, CLK90 => clk90_u, CLK180 => clk180_u, CLK270 => open, CLK2X => open, CLK2X180 => open,
      CLKDV => open, CLKFX => open, CLKFX180 => open, LOCKED => locked, PSDONE => open, STATUS => open);

  u_b0   : BUFG port map (I => clk0_u, O => clk0_b);
  u_b90  : BUFG port map (I => clk90_u, O => clk90_b);
  u_b180 : BUFG port map (I => clk180_u, O => clk180_b);

  process (clk0_b) begin
    if rising_edge(clk0_b) then
      s0 <= unsigned(sw);
      if s0(0) = '0' then n0 <= n0 + 1; end if;
      a0 <= n0(7 downto 0) + s0;
      c0 <= b90 + s0;
      e0 <= d180 + s0;
    end if;
  end process;
  process (clk90_b) begin if rising_edge(clk90_b) then b90 <= a0 + 3; end if; end process;
  process (clk180_b) begin if rising_edge(clk180_b) then d180 <= c0 + 5; end if; end process;

  led <= locked & n0(25) & std_logic_vector(e0(5 downto 0));
end rtl;
