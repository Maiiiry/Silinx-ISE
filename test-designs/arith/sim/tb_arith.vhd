----------------------------------------------------------------------------------
-- Test bench for arith (src/arith.sch.json): arithmetic on 4-bit buses.
--   co & s = a + b + ci      an adder with carry in and out
--   df = a - b, bo = a < b   a subtractor with its borrow out
--   eq = a = b, lt = a < b   comparators (unsigned)
--   ges = a >= b             a comparator of a and b as signed numbers
-- Every value of a, b and ci (512 in all) is applied and each output compared
-- with the value above, computed with integers. Each mismatch is reported as an
-- ERROR; when all of them pass: "Simulation finished OK". (A Silinx test design,
-- #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_arith is
end tb_arith;

architecture behavior of tb_arith is
  signal a, b : std_logic_vector(3 downto 0) := (others => '0');
  signal ci : std_logic := '0';
  signal s, df : std_logic_vector(3 downto 0);
  signal co, bo, eq, lt, ges : std_logic;

  function bit_of(c : boolean) return std_logic is
  begin
    if c then return '1'; else return '0'; end if;
  end function;
begin
  uut: entity work.arith
    port map (a => a, b => b, ci => ci, s => s, co => co, df => df, bo => bo, eq => eq, lt => lt, ges => ges);

  stim: process
    variable errors : integer := 0;
    variable sa, sb : integer;   -- a and b as signed numbers (-8 to 7)
  begin
    for ia in 0 to 15 loop
      for ib in 0 to 15 loop
        for ic in 0 to 1 loop
          a <= std_logic_vector(to_unsigned(ia, 4));
          b <= std_logic_vector(to_unsigned(ib, 4));
          ci <= bit_of(ic = 1);
          wait for 10 ns;
          if ia > 7 then sa := ia - 16; else sa := ia; end if;
          if ib > 7 then sb := ib - 16; else sb := ib; end if;
          if to_integer(unsigned(co & s)) /= ia + ib + ic
             or to_integer(unsigned(df)) /= (ia - ib + 16) mod 16 or bo /= bit_of(ia < ib)
             or eq /= bit_of(ia = ib) or lt /= bit_of(ia < ib) or ges /= bit_of(sa >= sb) then
            report "ERROR: wrong outputs for a = " & integer'image(ia) & ", b = " & integer'image(ib)
                 & ", ci = " & integer'image(ic) severity error;
            errors := errors + 1;
          end if;
        end loop;
      end loop;
    end loop;
    if errors = 0 then
      report "Simulation finished OK" severity note;
    else
      report "ERROR: " & integer'image(errors) & " wrong value(s)" severity error;
    end if;
    wait;
  end process;
end behavior;
