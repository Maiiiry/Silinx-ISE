-- Open-flow check of multipliers whose control pins are tied to constants (ISE check, not a board
-- test; #50): CE / RST tied to 1, to 0 or to a signal, with and without registers; MULT18X18S
-- (ISE: CE on CEA, CEB and CEP, R on RSTA, RSTB and RSTP) and MULT18X18 (ISE: enables and clock
-- tied to 0, resets to 1). ISE ties a pin to 1 to the VCC site of the block-RAM interconnect tile
-- and a pin to 0 to GND, never through the pin's inverter. A counter drives the inputs, XORs make
-- the outputs.
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
  signal c : unsigned(17 downto 0) := (others => '0');
  signal cv, cx, cb : std_logic_vector(17 downto 0);
  signal p0, p1, p2, p3, p4, p5, p6, p7, p8, p9 : std_logic_vector(35 downto 0);
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
      c <= c + unsigned(s & '1');
    end if;
  end process;
  cv <= std_logic_vector(c);
  cx <= cv xor "010101010101010101";
  cb <= cv(8 downto 0) & cv(17 downto 9);

  -- the B register only: enables and resets from signals and constants
  m0 : MULT18X18SIO generic map (AREG => 0, BREG => 1, PREG => 0)
    port map (P => p0, A => cv, B => cv, BCIN => zero18, CEA => s(2), CEB => '1', CEP => s(3), CLK => clk,
              RSTA => s(2), RSTB => '0', RSTP => s(3), BCOUT => open);
  -- no register
  m1 : MULT18X18 port map (P => p1, A => cb, B => cb);
  -- the product register only: the enables 1, the resets 0
  m2 : MULT18X18SIO generic map (AREG => 0, BREG => 0, PREG => 1)
    port map (P => p2, A => cv, B => cb, BCIN => zero18, CEA => '1', CEB => '1', CEP => '1', CLK => clk,
              RSTA => '0', RSTB => '0', RSTP => '0', BCOUT => open);
  -- no register, a clock
  m3 : MULT18X18SIO generic map (AREG => 0, BREG => 0, PREG => 0)
    port map (P => p3, A => cx, B => cv, BCIN => zero18, CEA => '1', CEB => '1', CEP => '1', CLK => clk,
              RSTA => '0', RSTB => '0', RSTP => '0', BCOUT => open);
  -- the A register only: the enables 0, the resets 1
  m4 : MULT18X18SIO generic map (AREG => 1, BREG => 0, PREG => 0)
    port map (P => p4, A => cb, B => cx, BCIN => zero18, CEA => '0', CEB => '0', CEP => '0', CLK => clk,
              RSTA => '1', RSTB => '1', RSTP => '1', BCOUT => open);
  -- no register, the enables 0, the resets 1, the clock 0
  m5 : MULT18X18SIO generic map (AREG => 0, BREG => 0, PREG => 0)
    port map (P => p5, A => cv, B => cx, BCIN => zero18, CEA => '0', CEB => '0', CEP => '0', CLK => '0',
              RSTA => '1', RSTB => '1', RSTP => '1', BCOUT => open);
  -- MULT18X18S: CE and R from signals, then CE 1 / R 0
  m6 : MULT18X18S port map (P => p6, A => cb, B => cv, C => clk, CE => s(0), R => s(1));
  m7 : MULT18X18S port map (P => p7, A => cx, B => cb, C => clk, CE => '1', R => '0');
  -- every register: the enables 1, the resets 0; then a mix
  m8 : MULT18X18SIO generic map (AREG => 1, BREG => 1, PREG => 1)
    port map (P => p8, A => cv, B => cb, BCIN => zero18, CEA => '1', CEB => '1', CEP => '1', CLK => clk,
              RSTA => '0', RSTB => '0', RSTP => '0', BCOUT => open);
  m9 : MULT18X18SIO generic map (AREG => 1, BREG => 1, PREG => 1)
    port map (P => p9, A => cx, B => cv, BCIN => zero18, CEA => '0', CEB => s(0), CEP => '1', CLK => clk,
              RSTA => '1', RSTB => '0', RSTP => s(1), BCOUT => open);

  y(5 downto 0) <= xr(p5) & xr(p4) & xr(p3) & xr(p2) & xr(p1) & xr(p0);
  y(6) <= xr(p6) xor xr(p8);
  y(7) <= xr(p7) xor xr(p9);
end rtl;
