----------------------------------------------------------------------------------
-- Test bench for full_adder (src/full_adder.sch.json): a full adder made of two
-- half adders (src/half_adder.sch.json, a schematic of its own used as a symbol).
--   s  = a xor b xor ci
--   co = 1 when two or three of a, b, ci are 1
-- The 8 values of a, b and ci are applied and co & s compared with a + b + ci.
-- Each mismatch is reported as an ERROR; when all of them pass:
-- "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_full_adder is
end tb_full_adder;

architecture behavior of tb_full_adder is
  signal a, b, ci : std_logic := '0';
  signal s, co : std_logic;
begin
  uut: entity work.full_adder
    port map (a => a, b => b, ci => ci, s => s, co => co);

  stim: process
    variable errors : integer := 0;
    variable x : std_logic_vector(2 downto 0);
    variable sum : integer;
  begin
    for n in 0 to 7 loop
      x := std_logic_vector(to_unsigned(n, 3));
      a <= x(2); b <= x(1); ci <= x(0);
      sum := 0;
      for k in 0 to 2 loop
        if x(k) = '1' then sum := sum + 1; end if;
      end loop;
      wait for 10 ns;
      if to_integer(unsigned'(co & s)) /= sum then
        report "ERROR: a + b + ci = " & integer'image(sum) & " for a b ci = " & integer'image(n)
             & ": co s are " & std_logic'image(co) & " " & std_logic'image(s) severity error;
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
