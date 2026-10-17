-- Silinx test design (compiled simulator, #429): a DCM_SP with every output clocking a counter (on its
-- rising edge, CLK0 and CLKFX on their falling edges too), LOCKED as a reset, a register on the main clock
-- read in the CLK0 domain; its frequencies as generics.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity dcm_vhd is
  generic (DV2 : integer := 5;   -- CLKDV_DIVIDE x 2
           FXM : integer := 3; FXD : integer := 2; DIV2 : boolean := false);
  port (clk    : in  std_logic;
        en     : in  std_logic;
        d      : in  std_logic_vector(3 downto 0);
        locked : out std_logic;
        n0, n90, n180, n270, n2x, n2x180, ndv, nfx, nfx180 : out std_logic_vector(7 downto 0);
        f0, ffx, x0 : out std_logic_vector(3 downto 0));
end dcm_vhd;

architecture rtl of dcm_vhd is
  signal c0u, c0, c90, c180, c270, c2x, c2x180, cdv, cfx, cfx180, lk : std_logic;
  type cnt_t is array (0 to 8) of unsigned(7 downto 0);
  signal cnt : cnt_t := (others => (others => '0'));
  signal clks : std_logic_vector(0 to 8);
  signal fall0, fallfx, reg_m, cross : unsigned(3 downto 0) := (others => '0');
begin
  u_dcm : DCM_SP
    generic map (CLKDV_DIVIDE => real(DV2) / 2.0, CLKFX_MULTIPLY => FXM, CLKFX_DIVIDE => FXD, CLKIN_DIVIDE_BY_2 => DIV2, CLKIN_PERIOD => 20.0)
    port map (CLKIN => clk, CLKFB => c0, RST => '0', CLK0 => c0u, CLK90 => c90, CLK180 => c180, CLK270 => c270,
              CLK2X => c2x, CLK2X180 => c2x180, CLKDV => cdv, CLKFX => cfx, CLKFX180 => cfx180, LOCKED => lk);
  u_b0 : BUFG port map (I => c0u, O => c0);

  clks <= (c0, c90, c180, c270, c2x, c2x180, cdv, cfx, cfx180);
  g : for i in 0 to 8 generate
    process (clks(i))
    begin
      if rising_edge(clks(i)) then
        if lk = '1' and en = '1' then cnt(i) <= cnt(i) + i + 1; end if;
      end if;
    end process;
  end generate;

  process (c0) begin if falling_edge(c0) then fall0 <= fall0 + unsigned(d); end if; end process;
  process (cfx) begin if falling_edge(cfx) then fallfx <= fallfx + 1; end if; end process;
  -- a register of the main clock, read in CLK0's domain
  process (clk) begin if rising_edge(clk) then reg_m <= reg_m + unsigned(d); end if; end process;
  process (c0) begin if rising_edge(c0) then cross <= reg_m; end if; end process;

  locked <= lk;
  n0 <= std_logic_vector(cnt(0)); n90 <= std_logic_vector(cnt(1)); n180 <= std_logic_vector(cnt(2));
  n270 <= std_logic_vector(cnt(3)); n2x <= std_logic_vector(cnt(4)); n2x180 <= std_logic_vector(cnt(5));
  ndv <= std_logic_vector(cnt(6)); nfx <= std_logic_vector(cnt(7)); nfx180 <= std_logic_vector(cnt(8));
  f0 <= std_logic_vector(fall0); ffx <= std_logic_vector(fallfx); x0 <= std_logic_vector(cross);
end rtl;
