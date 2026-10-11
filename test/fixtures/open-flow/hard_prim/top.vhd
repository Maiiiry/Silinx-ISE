-- Open-flow check of instantiated primitives (ISE check, not a board test): block RAMs with both
-- ports at different widths and write modes, INIT / SRVAL; multipliers with input and output
-- registers (MULT18X18SIO, MULT18X18S); distributed RAMs and a shift register (RAM16X1D,
-- RAM32X1S, SRL16E_1). A counter drives every input, a few XORs make the outputs.
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
  signal cv, cx, cb, dib0 : std_logic_vector(17 downto 0);
  signal dib : std_logic_vector(31 downto 0);
  signal a0 : std_logic_vector(7 downto 0);
  signal ap0 : std_logic_vector(0 downto 0);
  signal b0 : std_logic_vector(31 downto 0);
  signal p0b : std_logic_vector(3 downto 0);
  signal a1, b1 : std_logic_vector(15 downto 0);
  signal p1a, p1b : std_logic_vector(1 downto 0);
  signal b2a : std_logic_vector(0 downto 0);
  signal b2b : std_logic_vector(3 downto 0);
  signal m0, m1 : std_logic_vector(35 downto 0);
  signal d0, d1, r32, q1 : std_logic;
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
  dib <= cv(13 downto 0) & cv;

  r0 : RAMB16_S9_S36
    generic map (WRITE_MODE_A => "WRITE_FIRST", WRITE_MODE_B => "READ_FIRST", INIT_A => "1" & X"A5", SRVAL_A => "0" & X"5A",
                 INIT_B => X"123456789", SRVAL_B => X"987654321",
                 INIT_00 => X"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
                 INITP_00 => X"00000000000000000000000000000000000000000000000000000000F0F0A5C3")
    port map (DOA => a0, DOPA => ap0, DOB => b0, DOPB => p0b, ADDRA => cv(10 downto 0), ADDRB => cv(17 downto 9),
              DIA => cv(7 downto 0), DIPA => cv(8 downto 8), DIB => dib, DIPB => cv(3 downto 0),
              ENA => s(0), ENB => s(1), WEA => s(2), WEB => s(3), SSRA => s(1), SSRB => s(0), CLKA => clk, CLKB => clk);
  r1 : RAMB16_S18_S18
    generic map (WRITE_MODE_A => "NO_CHANGE", WRITE_MODE_B => "WRITE_FIRST", INIT_A => "11" & X"FFFF", SRVAL_B => "10" & X"AAAA")
    port map (DOA => a1, DOPA => p1a, DOB => b1, DOPB => p1b, ADDRA => cv(9 downto 0), ADDRB => cv(17 downto 8),
              DIA => cv(15 downto 0), DIPA => cv(1 downto 0), DIB => cv(17 downto 2), DIPB => cv(3 downto 2),
              ENA => s(2), ENB => s(3), WEA => s(0), WEB => s(1), SSRA => s(3), SSRB => s(2), CLKA => clk, CLKB => clk);
  r2 : RAMB16_S1_S4
    generic map (WRITE_MODE_A => "READ_FIRST", WRITE_MODE_B => "NO_CHANGE")
    port map (DOA => b2a, DOB => b2b, ADDRA => cv(13 downto 0), ADDRB => cv(17 downto 6), DIA => cv(0 downto 0), DIB => cv(4 downto 1),
              ENA => s(1), ENB => s(0), WEA => s(3), WEB => s(2), SSRA => s(0), SSRB => s(3), CLKA => clk, CLKB => clk);
  u0 : MULT18X18SIO
    generic map (AREG => 1, BREG => 0, PREG => 1, B_INPUT => "DIRECT")
    port map (P => m0, A => cv, B => cb, BCIN => zero18, CEA => s(0), CEB => s(1), CEP => s(2), CLK => clk,
              RSTA => s(3), RSTB => s(2), RSTP => s(1), BCOUT => open);
  u1 : MULT18X18S port map (P => m1, A => cx, B => cv, C => clk, CE => s(3), R => s(0));
  u2 : RAM16X1D generic map (INIT => X"A5C3")
    port map (SPO => d0, DPO => d1, A0 => cv(0), A1 => cv(1), A2 => cv(2), A3 => cv(3), DPRA0 => cv(4), DPRA1 => cv(5),
              DPRA2 => cv(6), DPRA3 => cv(7), D => cv(8), WE => s(0), WCLK => clk);
  u3 : RAM32X1S generic map (INIT => X"12345678")
    port map (O => r32, A0 => cv(1), A1 => cv(2), A2 => cv(3), A3 => cv(4), A4 => cv(5), D => cv(9), WE => s(1), WCLK => clk);
  u4 : SRL16E_1 generic map (INIT => X"8001")
    port map (Q => q1, A0 => cv(10), A1 => cv(11), A2 => '0', A3 => '1', CE => s(2), CLK => clk, D => cv(12));

  y <= (xr(a0) xor xr(ap0) xor xr(b0) xor xr(p0b)) & (xr(a1) xor xr(p1a)) & (xr(b1) xor xr(p1b)) & (xr(b2a) xor xr(b2b))
       & xr(m0) & xr(m1) & (d0 xor d1) & (r32 xor q1);
end rtl;
