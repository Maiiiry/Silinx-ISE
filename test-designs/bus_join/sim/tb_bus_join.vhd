----------------------------------------------------------------------------------
-- Test bench for bus_join (src/bus_join.sch.json): bus joins and a split.
--   y = a & b & c          a join of parts of 2, 1 and 3 bits
--   z = a & b & c & b      a join of a join
--   w = a(0) & b & c(2)    bits taken from the parts again
-- Every value of a, b and c (64 in all) is applied and each output compared with
-- the value above. Each mismatch is reported as an ERROR; when all of them pass:
-- "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_bus_join is
end tb_bus_join;

architecture behavior of tb_bus_join is
  signal a : std_logic_vector(1 downto 0) := (others => '0');
  signal b : std_logic := '0';
  signal c : std_logic_vector(2 downto 0) := (others => '0');
  signal y : std_logic_vector(5 downto 0);
  signal z : std_logic_vector(6 downto 0);
  signal w : std_logic_vector(2 downto 0);
begin
  uut: entity work.bus_join
    port map (a => a, b => b, c => c, y => y, z => z, w => w);

  stim: process
    variable errors : integer := 0;
    variable v : std_logic_vector(5 downto 0);
  begin
    for n in 0 to 63 loop
      v := std_logic_vector(to_unsigned(n, 6));
      a <= v(5 downto 4);
      b <= v(3);
      c <= v(2 downto 0);
      wait for 10 ns;
      if y /= v or z /= (v & v(3)) or w /= (v(4) & v(3) & v(2)) then
        report "ERROR: wrong outputs for a & b & c = " & integer'image(n) severity error;
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
