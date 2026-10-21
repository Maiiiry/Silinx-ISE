-- Open-flow check of the multiplier cascade (#2; an ISE check, not a board test): three MULT18X18SIO, the second and
-- the third taking B from the one below through BCOUT -> BCIN (B_INPUT = CASCADE): u_m0 registers B, u_m1 does not
-- (its BCOUT is u_m0's register), u_m2 registers it again. A counter and the switches drive A and B; a few XORs of the
-- products make the LEDs.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(7 downto 0);
        btn : in  std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal c : unsigned(17 downto 0) := (others => '0');
  signal a0, a1, a2, b0 : std_logic_vector(17 downto 0);
  signal bc0, bc1 : std_logic_vector(17 downto 0);
  signal p0, p1, p2 : std_logic_vector(35 downto 0);
  signal zero18 : std_logic_vector(17 downto 0) := (others => '0');
  function xr(v : std_logic_vector) return std_logic is
    variable r : std_logic := '0';
  begin
    for i in v'range loop r := r xor v(i); end loop;
    return r;
  end function;
begin
  process (clk)
  begin
    if rising_edge(clk) then
      c <= c + 1;
    end if;
  end process;
  a0 <= std_logic_vector(c);
  a1 <= sw & std_logic_vector(c(9 downto 0));
  a2 <= std_logic_vector(c(8 downto 0)) & sw & btn(0);
  b0 <= btn & sw & std_logic_vector(c(17 downto 12));

  u_m0 : MULT18X18SIO generic map (AREG => 1, BREG => 1, PREG => 1, B_INPUT => "DIRECT")
    port map (A => a0, B => b0, BCIN => zero18, CEA => '1', CEB => btn(1), CEP => '1', CLK => clk,
              RSTA => '0', RSTB => '0', RSTP => btn(2), BCOUT => bc0, P => p0);
  u_m1 : MULT18X18SIO generic map (AREG => 1, BREG => 0, PREG => 1, B_INPUT => "CASCADE")
    port map (A => a1, B => zero18, BCIN => bc0, CEA => '1', CEB => '1', CEP => '1', CLK => clk,
              RSTA => '0', RSTB => '0', RSTP => '0', BCOUT => bc1, P => p1);
  u_m2 : MULT18X18SIO generic map (AREG => 0, BREG => 1, PREG => 1, B_INPUT => "CASCADE")
    port map (A => a2, B => zero18, BCIN => bc1, CEA => '1', CEB => '1', CEP => '1', CLK => clk,
              RSTA => '0', RSTB => btn(3), RSTP => '0', BCOUT => open, P => p2);

  led(0) <= xr(p0(11 downto 0));
  led(1) <= xr(p0(35 downto 12));
  led(2) <= xr(p1(11 downto 0));
  led(3) <= xr(p1(35 downto 12));
  led(4) <= xr(p2(11 downto 0));
  led(5) <= xr(p2(35 downto 12));
  led(6) <= p1(35) xor p2(35);
  led(7) <= p0(0) xor p2(0);
end rtl;
