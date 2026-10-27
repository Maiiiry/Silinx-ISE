----------------------------------------------------------------------------------
-- Test bench for vending (src/vending.fsm.json): a vending machine of 30 cents, a
-- Mealy machine (a state diagram read from the diagram corpus's vending.kiss2).
--   x: the coin put in this cycle, 00 none, 01 5 cents, 10 10 cents, 11 25 cents
--   y(2): dispense; y(1 downto 0): the change, 00 none, 01 5 cents, 10 10 cents,
--         11 20 cents (also for 15 cents: the machine has no 15-cent coin)
-- The reference is written another way: the credit in cents; when the credit and
-- the coin make 30 or more, it dispenses, gives the rest as change and the credit
-- goes back to 0. 300 cycles of pseudo-random coins (an LFSR); y is compared
-- before each rising edge of clk. Each mismatch is reported as an ERROR; when all
-- of them pass: "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_vending is
end tb_vending;

architecture behavior of tb_vending is
  signal clk, rst : std_logic := '0';
  signal x : std_logic_vector(1 downto 0) := "00";
  signal y : std_logic_vector(2 downto 0);
begin
  uut: entity work.vending
    port map (clk => clk, rst => rst, x => x, y => y);

  stim: process
    variable errors, sold : integer := 0;
    variable lfsr : std_logic_vector(15 downto 0) := x"5EED";
    variable credit, coin, total : integer := 0;
    variable expect : std_logic_vector(2 downto 0);
  begin
    rst <= '1';
    wait for 10 ns;
    rst <= '0';
    for k in 0 to 299 loop
      lfsr := lfsr(14 downto 0) & (lfsr(15) xor lfsr(13) xor lfsr(12) xor lfsr(10));
      lfsr := lfsr(14 downto 0) & (lfsr(15) xor lfsr(13) xor lfsr(12) xor lfsr(10));
      x <= lfsr(1 downto 0);
      wait for 5 ns;
      case x is
        when "01" => coin := 5;
        when "10" => coin := 10;
        when "11" => coin := 25;
        when others => coin := 0;
      end case;
      total := credit + coin;
      if total >= 30 then
        case total - 30 is
          when 0 => expect := "100";
          when 5 => expect := "101";
          when 10 => expect := "110";
          when others => expect := "111";
        end case;
        credit := 0;
        sold := sold + 1;
      else
        expect := "000";
        credit := total;
      end if;
      if y /= expect then
        report "ERROR: cycle " & integer'image(k) & ": wrong y for a coin of " & integer'image(coin) & " cents" severity error;
        errors := errors + 1;
      end if;
      clk <= '1';
      wait for 10 ns;
      clk <= '0';
      wait for 5 ns;
    end loop;
    if errors = 0 then
      report "Simulation finished OK (" & integer'image(sold) & " sold)" severity note;
    else
      report "ERROR: " & integer'image(errors) & " wrong value(s)" severity error;
    end if;
    wait;
  end process;
end behavior;
