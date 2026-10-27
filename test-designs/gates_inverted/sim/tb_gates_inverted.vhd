----------------------------------------------------------------------------------
-- Test bench for gates_inverted (src/gates_inverted.sch.json): gates of 2 to 5
-- inputs, with inverted inputs (Xilinx's ANDnBk inverts I0 .. I(k-1)).
--   y0 = a' b            y1 = a' + b' + c        y2 = (a' b c)'
--   y3 = (a + e)'        y4 = a xor b xor c       y5 = (c xor e)'
--   y6 = a' b' c e       y7 = a + b + c + e + y0  y8 = (a + e)'
--   vw = v nand w (bitwise, 3 bits)
-- Every value of the 10 input bits (1024 in all) is applied and each output
-- compared with the value above. Each mismatch is reported as an ERROR; when all
-- of them pass: "Simulation finished OK". (A Silinx test design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_gates_inverted is
end tb_gates_inverted;

architecture behavior of tb_gates_inverted is
  signal a, b, c, e : std_logic := '0';
  signal v, w, vw : std_logic_vector(2 downto 0) := (others => '0');
  signal y0, y1, y2, y3, y4, y5, y6, y7, y8 : std_logic;
begin
  uut: entity work.gates_inverted
    port map (a => a, b => b, c => c, e => e, v => v, w => w,
              y0 => y0, y1 => y1, y2 => y2, y3 => y3, y4 => y4, y5 => y5, y6 => y6, y7 => y7, y8 => y8, vw => vw);

  stim: process
    variable errors : integer := 0;
    variable x : std_logic_vector(9 downto 0);
    variable t0 : std_logic;
    variable got, expect : std_logic_vector(11 downto 0);
  begin
    for n in 0 to 1023 loop
      x := std_logic_vector(to_unsigned(n, 10));
      a <= x(9); b <= x(8); c <= x(7); e <= x(6);
      v <= x(5 downto 3); w <= x(2 downto 0);
      wait for 10 ns;
      t0 := (not x(9)) and x(8);
      expect := t0
              & ((not x(9)) or (not x(8)) or x(7))
              & (not ((not x(9)) and x(8) and x(7)))
              & (not (x(9) or x(6)))
              & (x(9) xor x(8) xor x(7))
              & (not (x(7) xor x(6)))
              & ((not x(9)) and (not x(8)) and x(7) and x(6))
              & (x(9) or x(8) or x(7) or x(6) or t0)
              & (not (x(9) or x(6)))
              & (x(5 downto 3) nand x(2 downto 0));
      got := y0 & y1 & y2 & y3 & y4 & y5 & y6 & y7 & y8 & vw;
      if got /= expect then
        report "ERROR: wrong outputs for the inputs " & integer'image(n) severity error;
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
