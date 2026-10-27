----------------------------------------------------------------------------------
-- Test bench for johnson16 (src/johnson16.fsm.json): a counter of 16 states with
-- an enable and a direction (a state diagram read from the diagram corpus's
-- johnson16.kiss2).
--   x(1): enable; x(0): up (1) or down (0)
--   y: the number of the state, J0 .. J15
-- The reference is written another way: a number from 0 to 15, +1 or -1 (modulo
-- 16) at each rising edge of clk when enabled. 300 cycles of pseudo-random x (an
-- LFSR); y is compared before each rising edge. Each mismatch is reported as an
-- ERROR; when all of them pass: "Simulation finished OK". (A Silinx test design,
-- #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_johnson16 is
end tb_johnson16;

architecture behavior of tb_johnson16 is
  signal clk, rst : std_logic := '0';
  signal x : std_logic_vector(1 downto 0) := "00";
  signal y : std_logic_vector(3 downto 0);
begin
  uut: entity work.johnson16
    port map (clk => clk, rst => rst, x => x, y => y);

  stim: process
    variable errors : integer := 0;
    variable lfsr : std_logic_vector(15 downto 0) := x"1D0F";
    variable count : integer := 0;
  begin
    rst <= '1';
    wait for 10 ns;
    rst <= '0';
    for k in 0 to 299 loop
      lfsr := lfsr(14 downto 0) & (lfsr(15) xor lfsr(13) xor lfsr(12) xor lfsr(10));
      lfsr := lfsr(14 downto 0) & (lfsr(15) xor lfsr(13) xor lfsr(12) xor lfsr(10));
      x <= lfsr(1 downto 0);
      wait for 5 ns;
      if to_integer(unsigned(y)) /= count then
        report "ERROR: cycle " & integer'image(k) & ": y is " & integer'image(to_integer(unsigned(y)))
             & ", expected " & integer'image(count) severity error;
        errors := errors + 1;
      end if;
      if x(1) = '1' then
        if x(0) = '1' then count := (count + 1) mod 16; else count := (count + 15) mod 16; end if;
      end if;
      clk <= '1';
      wait for 10 ns;
      clk <= '0';
      wait for 5 ns;
    end loop;
    if errors = 0 then
      report "Simulation finished OK" severity note;
    else
      report "ERROR: " & integer'image(errors) & " wrong value(s)" severity error;
    end if;
    wait;
  end process;
end behavior;
