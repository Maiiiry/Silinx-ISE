-- Open-flow board test (Basys2-250): paths between the clocks of one DCM, and the pads of DCM clocks (#601).
-- The 50 MHz clock (B8) enters a DCM_SP: CLK0 (50 MHz, the feedback), CLK2X (100 MHz), CLKFX (x 3 / 2 = 75 MHz)
-- and CLKDV (/ 4 = 12.5 MHz), each on a global buffer. An 8-bit counter on CLK0 is passed, through an adder at
-- each step, to CLK2X, back to CLK0, to CLKFX, back to CLK0, to CLKDV and back to CLK0 on its falling edge, as
-- ISE's trce times such paths: against the time between the two clocks' edges (CLK0 into CLKFX 6.667 ns). CLK2X's
-- counter is enabled from CLKFX's register of the switches: 3.333 ns between their edges, which Silinx's routing
-- misses by about 0.4 ns (trce agrees; ISE's own routing meets it). The switches are registered on CLK0 and on
-- CLKFX (OFFSET IN), the LEDs come from registers on CLK0, CLK2X and CLKFX (OFFSET OUT):
--   LD0-LD3  the last step's low bits (CLK0, falling edge), changing too fast to see blink
--   LD4      bit 25 of a counter on CLK2X (about 0.7 s per on-off cycle)
--   LD5      bit 25 of a counter on CLKFX (about 0.9 s)
--   LD6      bit 25 of a counter on CLK0 (about 1.3 s)
--   LD7      LOCKED (on when the DCM has locked)
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
  signal clkin_b, clk0_u, clk0_b, clkdv_u, clkdv_b, clkfx_u, clkfx_b, clk2x_u, clk2x_b, locked : std_logic;
  signal n0, nfx, n2x : unsigned(26 downto 0) := (others => '0');
  signal s0, sfx, a0, b2x, c0, dfx, e0, fdv, g0n : unsigned(7 downto 0) := (others => '0');
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

  process (clk0_b) begin
    if rising_edge(clk0_b) then
      s0 <= unsigned(sw);
      if s0(0) = '0' then n0 <= n0 + 1; end if;
      a0 <= n0(7 downto 0) + s0;
      c0 <= b2x + s0;
      e0 <= dfx + s0;
    end if;
  end process;
  process (clk0_b) begin if falling_edge(clk0_b) then g0n <= fdv + s0; end if; end process;
  process (clk2x_b) begin
    if rising_edge(clk2x_b) then
      b2x <= a0 + n2x(7 downto 0);
      if sfx(0) = '0' then n2x <= n2x + 1; end if;
    end if;
  end process;
  process (clkfx_b) begin
    if rising_edge(clkfx_b) then
      sfx <= unsigned(sw);
      dfx <= c0 + sfx;
      if sfx(0) = '0' then nfx <= nfx + 1; end if;
    end if;
  end process;
  process (clkdv_b) begin if rising_edge(clkdv_b) then fdv <= e0 + 1; end if; end process;

  led <= locked & n0(25) & nfx(25) & n2x(25) & std_logic_vector(g0n(3 downto 0));
end rtl;
