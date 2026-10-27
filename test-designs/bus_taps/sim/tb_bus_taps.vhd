----------------------------------------------------------------------------------
-- Test bench for bus_taps (src/bus_taps.sch.json): taps of an 8-bit bus a.
--   msb  = a(7)                     a tap of one bit
--   mid  = a(5 downto 2)            a tap of several bits
--   rev  = a(0) & a(1) & a(2) & a(3) the low bits reversed through a bus join
--   nb4  = not a(4)                 a tap into an inverter
--   ends = a(7) and a(0)            two taps into a gate
-- Every value of a (0 to 255) is applied and each output compared with the value
-- above. Each mismatch is reported as an ERROR; when all of them pass:
-- "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_bus_taps is
end tb_bus_taps;

architecture behavior of tb_bus_taps is
  signal a : std_logic_vector(7 downto 0) := (others => '0');
  signal msb, nb4, ends : std_logic;
  signal mid, rev : std_logic_vector(3 downto 0);
begin
  uut: entity work.bus_taps
    port map (a => a, msb => msb, mid => mid, rev => rev, nb4 => nb4, ends => ends);

  stim: process
    variable errors : integer := 0;
    variable v : std_logic_vector(7 downto 0);
  begin
    for n in 0 to 255 loop
      v := std_logic_vector(to_unsigned(n, 8));
      a <= v;
      wait for 10 ns;
      if msb /= v(7) or mid /= v(5 downto 2) or rev /= (v(0) & v(1) & v(2) & v(3))
         or nb4 /= not v(4) or ends /= (v(7) and v(0)) then
        report "ERROR: wrong outputs for a = " & integer'image(n) severity error;
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
