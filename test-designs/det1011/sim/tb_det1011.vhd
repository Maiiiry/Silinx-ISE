----------------------------------------------------------------------------------
-- Test bench for det1011 (src/det1011.fsm.json): a Mealy machine that detects the
-- sequence 1011 on its input x, overlapping: y = 1 during the cycle of the last 1
-- of 1011 (a state diagram read from the diagram corpus's det1011.kiss2).
-- The reference is written another way: the last three inputs in a shift register,
-- y = 1 when they are 101 and x is 1. 200 cycles of x (a few 1011 and 1011011 first,
-- then pseudo-random bits from an LFSR); y is compared before each rising edge of
-- clk. Each mismatch is reported as an ERROR; when all of them pass:
-- "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_det1011 is
end tb_det1011;

architecture behavior of tb_det1011 is
  signal clk, rst, x : std_logic := '0';
  signal y : std_logic;
  constant FIRST : std_logic_vector(0 to 15) := "1011011010110110";
begin
  uut: entity work.det1011
    port map (clk => clk, rst => rst, x => x, y => y);

  stim: process
    variable errors, found : integer := 0;
    variable lfsr : std_logic_vector(15 downto 0) := x"B5A3";
    variable last : std_logic_vector(2 downto 0) := "000";   -- the last three inputs, the oldest first
    variable expect : std_logic;
  begin
    rst <= '1';
    wait for 10 ns;
    rst <= '0';
    for k in 0 to 199 loop
      if k <= FIRST'high then
        x <= FIRST(k);
      else
        lfsr := lfsr(14 downto 0) & (lfsr(15) xor lfsr(13) xor lfsr(12) xor lfsr(10));
        x <= lfsr(0);
      end if;
      wait for 5 ns;
      if last = "101" and x = '1' then expect := '1'; else expect := '0'; end if;
      if expect = '1' then found := found + 1; end if;
      if y /= expect then
        report "ERROR: cycle " & integer'image(k) & ": y is " & std_logic'image(y) & ", expected " & std_logic'image(expect) severity error;
        errors := errors + 1;
      end if;
      last := last(1 downto 0) & x;
      clk <= '1';
      wait for 10 ns;
      clk <= '0';
      wait for 5 ns;
    end loop;
    if errors = 0 then
      report "Simulation finished OK (1011 found " & integer'image(found) & " times)" severity note;
    else
      report "ERROR: " & integer'image(errors) & " wrong value(s)" severity error;
    end if;
    wait;
  end process;
end behavior;
