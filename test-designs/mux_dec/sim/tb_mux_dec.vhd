----------------------------------------------------------------------------------
-- Test bench for mux_dec (src/mux_dec.sch.json): multiplexers, a decoder, a
-- priority encoder and a demultiplexer.
--   m2  = dd(3 downto 2) when s(0) = '1' else dd(1 downto 0)   M2_1, 2 bits wide
--   m4  = dd(4 + s(1 downto 0))                               M4_1
--   m8  = dd(s) when en = '1' else '0'                        M8_1 with its enable
--   dec = one-hot of s(1 downto 0) when en = '1' else "0000"  the decoder
--   enc = the highest of dd(7 downto 4) that is 1 (7: "11" … 4 or none: "00"),
--   v   = some of dd(7 downto 4) is 1                         the priority encoder
--   dm  = (en and s(0)) & (en and not s(0))                   the 1:2 demultiplexer
-- Every value of dd, s and en (4096 in all) is applied and each output compared
-- with the value above. Each mismatch is reported as an ERROR; when all of them
-- pass: "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_mux_dec is
end tb_mux_dec;

architecture behavior of tb_mux_dec is
  signal dd : std_logic_vector(7 downto 0) := (others => '0');
  signal s : std_logic_vector(2 downto 0) := (others => '0');
  signal en : std_logic := '0';
  signal m2, enc, dm : std_logic_vector(1 downto 0);
  signal m4, m8, v : std_logic;
  signal dec : std_logic_vector(3 downto 0);
begin
  uut: entity work.mux_dec
    port map (dd => dd, s => s, en => en, m2 => m2, m4 => m4, m8 => m8, dec => dec, enc => enc, v => v, dm => dm);

  stim: process
    variable errors : integer := 0;
    variable x : std_logic_vector(11 downto 0);
    variable d : std_logic_vector(7 downto 0);
    variable sel : integer;
    variable e_m2, e_enc, e_dm : std_logic_vector(1 downto 0);
    variable e_m4, e_m8, e_v : std_logic;
    variable e_dec : std_logic_vector(3 downto 0);
  begin
    for n in 0 to 4095 loop
      x := std_logic_vector(to_unsigned(n, 12));
      d := x(11 downto 4);
      dd <= d; s <= x(3 downto 1); en <= x(0);
      wait for 10 ns;
      sel := to_integer(unsigned(x(3 downto 1)));
      if x(1) = '1' then e_m2 := d(3 downto 2); else e_m2 := d(1 downto 0); end if;
      e_m4 := d(4 + sel mod 4);
      e_m8 := d(sel) and x(0);
      e_dec := "0000";
      if x(0) = '1' then e_dec(sel mod 4) := '1'; end if;
      if d(7) = '1' then e_enc := "11"; elsif d(6) = '1' then e_enc := "10"; elsif d(5) = '1' then e_enc := "01"; else e_enc := "00"; end if;
      e_v := d(7) or d(6) or d(5) or d(4);
      e_dm := (x(0) and x(1)) & (x(0) and not x(1));
      if m2 /= e_m2 or m4 /= e_m4 or m8 /= e_m8 or dec /= e_dec or enc /= e_enc or v /= e_v or dm /= e_dm then
        report "ERROR: wrong outputs for dd = " & integer'image(to_integer(unsigned(d))) & ", s = " & integer'image(sel)
             & ", en = " & std_logic'image(x(0)) severity error;
        errors := errors + 1;
      end if;
    end loop;
    if errors = 0 then
      report "Simulation finished OK" severity note;
    else
      report "ERROR: " & integer'image(errors) & " wrong value(s)" severity error;
    end if;
    wait;
  end process;
end behavior;
