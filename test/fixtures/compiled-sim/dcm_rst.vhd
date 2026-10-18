-- Silinx test design (compiled simulator, #465): two DCM_SPs whose RST the design drives, A's from an input
-- (a reset button), B's from a register of the main clock (asserted at the main clock's edge, after the DCM's
-- edges at that time); every output but CLK90 / CLK270 clocking a counter (on its rising edge, CLK0 and CLKFX
-- on their falling edges too), LOCKED counted by the main clock; A's frequencies as generics.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity dcm_rst_vhd is
  generic (DV2 : integer := 5;   -- CLKDV_DIVIDE x 2
           FXM : integer := 3; FXD : integer := 2; DIV2 : boolean := false);
  port (clk    : in  std_logic;
        rst    : in  std_logic;
        pulse  : in  std_logic;
        lock_a, lock_b : out std_logic;
        n0, n180, n2x, n2x180, ndv, nfx, nfx180, nb0, nbfx : out std_logic_vector(7 downto 0);
        f0, ffx, nlk : out std_logic_vector(3 downto 0));
end dcm_rst_vhd;

architecture rtl of dcm_rst_vhd is
  signal c0u, c0, c180, c2x, c2x180, cdv, cfx, cfx180, lk, b0, bfx, lkb : std_logic;
  type cnt_t is array (0 to 8) of unsigned(7 downto 0);
  signal cnt : cnt_t := (others => (others => '0'));
  signal clks : std_logic_vector(0 to 8);
  signal fall0, fallfx, nlock : unsigned(3 downto 0) := (others => '0');
  signal rb : std_logic := '0';
begin
  u_a : DCM_SP
    generic map (CLKDV_DIVIDE => real(DV2) / 2.0, CLKFX_MULTIPLY => FXM, CLKFX_DIVIDE => FXD, CLKIN_DIVIDE_BY_2 => DIV2, CLKIN_PERIOD => 20.0)
    port map (CLKIN => clk, CLKFB => c0, RST => rst, CLK0 => c0u, CLK180 => c180,
              CLK2X => c2x, CLK2X180 => c2x180, CLKDV => cdv, CLKFX => cfx, CLKFX180 => cfx180, LOCKED => lk);
  u_b0 : BUFG port map (I => c0u, O => c0);
  u_b : DCM_SP
    generic map (CLKFX_MULTIPLY => 5, CLKFX_DIVIDE => 4, CLKIN_PERIOD => 20.0)
    port map (CLKIN => clk, RST => rb, CLK0 => b0, CLKFX => bfx, LOCKED => lkb);

  clks <= (c0, c180, c2x, c2x180, cdv, cfx, cfx180, b0, bfx);
  g : for i in 0 to 8 generate
    process (clks(i))
    begin
      if rising_edge(clks(i)) then cnt(i) <= cnt(i) + i + 1; end if;
    end process;
  end generate;

  process (c0) begin if falling_edge(c0) then fall0 <= fall0 + 1; end if; end process;
  process (cfx) begin if falling_edge(cfx) then fallfx <= fallfx + 1; end if; end process;
  process (clk)
  begin
    if rising_edge(clk) then
      rb <= pulse;
      if lk = '1' then nlock <= nlock + 1; end if;
    end if;
  end process;

  lock_a <= lk; lock_b <= lkb;
  n0 <= std_logic_vector(cnt(0)); n180 <= std_logic_vector(cnt(1)); n2x <= std_logic_vector(cnt(2));
  n2x180 <= std_logic_vector(cnt(3)); ndv <= std_logic_vector(cnt(4)); nfx <= std_logic_vector(cnt(5));
  nfx180 <= std_logic_vector(cnt(6)); nb0 <= std_logic_vector(cnt(7)); nbfx <= std_logic_vector(cnt(8));
  f0 <= std_logic_vector(fall0); ffx <= std_logic_vector(fallfx); nlk <= std_logic_vector(nlock);
end rtl;
