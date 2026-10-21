-- Silinx test design (compiled simulator, #845): a PLL_BASE with every output clocking a counter (on its rising
-- edge, CLKOUT1 and CLKOUT4 on their falling edges too: their duty cycles), LOCKED as an enable, a register on the
-- main clock read in CLKFBOUT's domain; a BUFIO2 on the main clock (its DIVCLK and SERDESSTROBE) and one on CLKOUT0
-- (inverted); the frequencies, duty cycles and phases as generics.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity pll_vhd is
  generic (MULT : integer := 8; DIV : integer := 1;
           D0 : integer := 8; D1 : integer := 4; D2 : integer := 16; D3 : integer := 5; D4 : integer := 3; D5 : integer := 10;
           DUTY1 : integer := 50; DUTY4 : integer := 25;                -- duty cycles in %
           PH2 : integer := 90; PH5 : integer := 0; FBPH : integer := 0;   -- phases in degrees
           IODIV : integer := 4; BYPASS : boolean := false);
  port (clk    : in  std_logic;
        en     : in  std_logic;
        d      : in  std_logic_vector(3 downto 0);
        locked : out std_logic;
        nfb, n0, n1, n2, n3, n4, n5, f1, f4, nio, ndiv, nstb, nb : out std_logic_vector(7 downto 0);
        x0 : out std_logic_vector(3 downto 0));
end pll_vhd;

architecture rtl of pll_vhd is
  signal cfb, cfbu, c0, c1, c2, c3, c4, c5, lk, ioclk, divclk, strobe, bclk : std_logic;
  type cnt_t is array (0 to 6) of unsigned(7 downto 0);
  signal cnt : cnt_t := (others => (others => '0'));
  signal clks : std_logic_vector(0 to 6);
  signal fall1, fall4, cio, cdiv, cstb, cb : unsigned(7 downto 0) := (others => '0');
  signal reg_m, cross : unsigned(3 downto 0) := (others => '0');
begin
  u_pll : PLL_BASE
    generic map (CLKFBOUT_MULT => MULT, DIVCLK_DIVIDE => DIV, CLKFBOUT_PHASE => real(FBPH), CLKIN_PERIOD => 20.0,
                 CLKOUT0_DIVIDE => D0, CLKOUT1_DIVIDE => D1, CLKOUT2_DIVIDE => D2, CLKOUT3_DIVIDE => D3, CLKOUT4_DIVIDE => D4, CLKOUT5_DIVIDE => D5,
                 CLKOUT1_DUTY_CYCLE => real(DUTY1) / 100.0, CLKOUT4_DUTY_CYCLE => real(DUTY4) / 100.0,
                 CLKOUT2_PHASE => real(PH2), CLKOUT5_PHASE => real(PH5))
    port map (CLKIN => clk, CLKFBIN => cfb, RST => '0', CLKFBOUT => cfbu, CLKOUT0 => c0, CLKOUT1 => c1, CLKOUT2 => c2,
              CLKOUT3 => c3, CLKOUT4 => c4, CLKOUT5 => c5, LOCKED => lk);
  u_fb : BUFG port map (I => cfbu, O => cfb);
  u_io : BUFIO2 generic map (DIVIDE => IODIV, DIVIDE_BYPASS => BYPASS) port map (I => clk, IOCLK => ioclk, DIVCLK => divclk, SERDESSTROBE => strobe);
  u_b0 : BUFIO2 generic map (DIVIDE => 3, DIVIDE_BYPASS => false, I_INVERT => true) port map (I => c0, DIVCLK => bclk);

  clks <= (cfb, c0, c1, c2, c3, c4, c5);
  g : for i in 0 to 6 generate
    process (clks(i))
    begin
      if rising_edge(clks(i)) then
        if lk = '1' and en = '1' then cnt(i) <= cnt(i) + i + 1; end if;
      end if;
    end process;
  end generate;

  process (c1) begin if falling_edge(c1) then fall1 <= fall1 + unsigned(d); end if; end process;
  process (c4) begin if falling_edge(c4) then fall4 <= fall4 + 1; end if; end process;
  process (ioclk) begin if rising_edge(ioclk) then cio <= cio + 1; end if; end process;
  process (divclk) begin if rising_edge(divclk) then cdiv <= cdiv + unsigned(d); end if; end process;
  process (clk) begin if rising_edge(clk) then if strobe = '1' then cstb <= cstb + 1; end if; end if; end process;
  process (bclk) begin if rising_edge(bclk) then cb <= cb + 1; end if; end process;
  -- a register of the main clock, read in CLKFBOUT's domain
  process (clk) begin if rising_edge(clk) then reg_m <= reg_m + unsigned(d); end if; end process;
  process (cfb) begin if rising_edge(cfb) then cross <= reg_m; end if; end process;

  locked <= lk;
  nfb <= std_logic_vector(cnt(0)); n0 <= std_logic_vector(cnt(1)); n1 <= std_logic_vector(cnt(2)); n2 <= std_logic_vector(cnt(3));
  n3 <= std_logic_vector(cnt(4)); n4 <= std_logic_vector(cnt(5)); n5 <= std_logic_vector(cnt(6));
  f1 <= std_logic_vector(fall1); f4 <= std_logic_vector(fall4);
  nio <= std_logic_vector(cio); ndiv <= std_logic_vector(cdiv); nstb <= std_logic_vector(cstb); nb <= std_logic_vector(cb);
  x0 <= std_logic_vector(cross);
end rtl;
