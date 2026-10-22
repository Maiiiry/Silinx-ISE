-- ISE check (#2): four clocks, each on a block RAM's port B and a multiplier's registers (port A on the first): the
-- clock pins from every global line (before, only line 4 reached a CLKB or a multiplier's CLK, so the placer had no
-- buffers for this)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic_vector(3 downto 0);
        s   : in  std_logic_vector(3 downto 0);
        y   : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal c0 : unsigned(17 downto 0) := (others => '0');
  signal cv0, zero18 : std_logic_vector(17 downto 0);
begin
  zero18 <= (others => '0');
  process (clk(0))
  begin
    if rising_edge(clk(0)) then
      c0 <= c0 + 1;
    end if;
  end process;
  cv0 <= std_logic_vector(c0);
  g : for k in 0 to 3 generate
    signal c : unsigned(17 downto 0) := (others => '0');
    signal cv : std_logic_vector(17 downto 0);
    signal da, db : std_logic_vector(15 downto 0);
    signal pa, pb : std_logic_vector(1 downto 0);
    signal p : std_logic_vector(35 downto 0);
  begin
    process (clk(k))
    begin
      if rising_edge(clk(k)) then
        c <= c + 1;
      end if;
    end process;
    cv <= std_logic_vector(c);
    r : RAMB16_S18_S18
      generic map (WRITE_MODE_A => "WRITE_FIRST", WRITE_MODE_B => "READ_FIRST")
      port map (DOA => da, DOPA => pa, DOB => db, DOPB => pb, ADDRA => cv0(9 downto 0), ADDRB => cv(17 downto 8),
                DIA => cv0(15 downto 0), DIPA => cv0(1 downto 0), DIB => cv(16 downto 1), DIPB => cv(3 downto 2),
                ENA => s(0), ENB => s(1), WEA => s(2), WEB => s(3), SSRA => '0', SSRB => '0', CLKA => clk(0), CLKB => clk(k));
    m : MULT18X18SIO
      generic map (AREG => 1, BREG => 1, PREG => 1, B_INPUT => "DIRECT")
      port map (P => p, A => cv, B => cv0, BCIN => zero18, CEA => s(0), CEB => s(1), CEP => s(2), CLK => clk(k),
                RSTA => '0', RSTB => '0', RSTP => '0', BCOUT => open);
    -- (every output of the block RAM used: none dangling for ISE's DRC)
    process (da, db, pa, pb)
      variable x : std_logic;
    begin
      x := pa(0) xor pa(1) xor pb(0) xor pb(1);
      for i in 0 to 15 loop
        x := x xor da(i) xor db(i);
      end loop;
      y(2 * k) <= x;
    end process;
    y(2 * k + 1) <= p(k + 30) xor p(k);
  end generate;
end rtl;
