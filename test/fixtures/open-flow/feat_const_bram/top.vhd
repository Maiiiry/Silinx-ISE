-- Open-flow check of block RAMs whose control pins are tied to constants (ISE check, not a board
-- test; #50): every combination of EN / WE / SSR tied to 1, to 0 or to a signal, on single-port
-- and dual-port block RAMs. ISE ties a pin to 1 to the VCC site of the block-RAM interconnect
-- tile and a pin to 0 to GND, never through the pin's inverter. A counter drives the addresses and
-- data, XORs make the outputs.
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
  signal cv : std_logic_vector(17 downto 0);
  signal d0, d1, d2, d3, d4, d5, d6, d7 : std_logic_vector(7 downto 0);
  signal da1, db1 : std_logic_vector(15 downto 0);
  signal p1a, p1b : std_logic_vector(1 downto 0);
  signal da2, db2 : std_logic_vector(3 downto 0);
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

  -- single port: EN, WE, SSR each 1 / 0 / a signal
  b0 : RAMB16_S9
    port map (DO => d0, ADDR => cv(17 downto 7), DI => cv(14 downto 7), DIP => "0", EN => s(2), WE => s(3), SSR => '1', CLK => clk);
  b1 : RAMB16_S9 generic map (INIT_00 => X"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF")
    port map (DO => d1, ADDR => cv(10 downto 0), DI => cv(7 downto 0), DIP => "0", EN => '1', WE => '0', SSR => '0', CLK => clk);
  b2 : RAMB16_S9 generic map (INIT_00 => X"1123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF")
    port map (DO => d2, ADDR => cv(11 downto 1), DI => cv(8 downto 1), DIP => "0", EN => s(0), WE => '0', SSR => '0', CLK => clk);
  b3 : RAMB16_S9 generic map (INIT => X"1A5")
    port map (DO => d3, ADDR => cv(12 downto 2), DI => cv(9 downto 2), DIP => "0", EN => '0', WE => s(1), SSR => s(2), CLK => clk);
  b4 : RAMB16_S9 generic map (SRVAL => X"0C3")
    port map (DO => d4, ADDR => cv(13 downto 3), DI => cv(10 downto 3), DIP => "0", EN => '1', WE => '1', SSR => '1', CLK => clk);
  b5 : RAMB16_S9
    port map (DO => d5, ADDR => cv(14 downto 4), DI => cv(11 downto 4), DIP => "0", EN => s(3), WE => '1', SSR => '0', CLK => clk);
  b6 : RAMB16_S9 generic map (INIT => X"07E")
    port map (DO => d6, ADDR => cv(15 downto 5), DI => cv(12 downto 5), DIP => "0", EN => '0', WE => '1', SSR => '1', CLK => clk);
  b7 : RAMB16_S9
    port map (DO => d7, ADDR => cv(16 downto 6), DI => cv(13 downto 6), DIP => "0", EN => '1', WE => s(0), SSR => s(1), CLK => clk);
  -- dual port
  r1 : RAMB16_S18_S18
    generic map (SRVAL_A => "01" & X"1234")
    port map (DOA => da1, DOPA => p1a, DOB => db1, DOPB => p1b, ADDRA => cv(9 downto 0), ADDRB => cv(17 downto 8),
              DIA => cv(15 downto 0), DIPA => cv(1 downto 0), DIB => cv(17 downto 2), DIPB => cv(3 downto 2),
              ENA => '1', WEA => s(0), SSRA => '1', ENB => s(1), WEB => '1', SSRB => '0', CLKA => clk, CLKB => clk);
  r2 : RAMB16_S4_S4
    generic map (INIT_00 => X"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF")
    port map (DOA => da2, DOB => db2, ADDRA => cv(11 downto 0), ADDRB => cv(17 downto 6), DIA => cv(3 downto 0), DIB => cv(7 downto 4),
              ENA => '0', WEA => '0', SSRA => '0', ENB => '1', WEB => '0', SSRB => s(2), CLKA => clk, CLKB => clk);

  y(5 downto 0) <= xr(d5) & xr(d4) & xr(d3) & xr(d2) & xr(d1) & xr(d0);
  y(6) <= xr(d6) xor xr(da1) xor xr(p1a) xor xr(da2);
  y(7) <= xr(d7) xor xr(db1) xor xr(p1b) xor xr(db2);
end rtl;
