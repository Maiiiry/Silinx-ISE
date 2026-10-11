-- Silinx test design (AGPL-3.0-only): VHDL records in the open synthesis (#69, #10): fields of
-- every width, a nested array field, arrays of records, record ports on array elements, constants,
-- a function on records. Used by test/synth-verilog.test.js and test/synth-diff.test.js.
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
package rp is
  type st_t is (S0, S1, S2);
  type nib_arr is array (0 to 2) of std_logic_vector(3 downto 0);
  type rec_t is record
    st   : st_t;
    cnt  : integer range 0 to 9;
    dat  : std_logic_vector(11 downto 0);
    nibs : nib_arr;
    ok   : boolean;
  end record;
  constant REC0 : rec_t := (st => S0, cnt => 0, dat => x"ABC", nibs => (x"1", x"2", x"3"), ok => false);
  type rec_arr is array (0 to 3) of rec_t;
  constant TAB : rec_arr := (REC0, (S1, 3, x"123", (x"4", x"5", x"6"), true), (S2, 9, x"FFF", (x"7", x"8", x"9"), false), REC0);
  function bump(r : rec_t) return rec_t;
end;
package body rp is
  function bump(r : rec_t) return rec_t is variable o : rec_t; begin
    o := r;
    if r.cnt = 9 then o.cnt := 0; o.st := S2; else o.cnt := r.cnt + 1; end if;
    o.nibs(1) := std_logic_vector(unsigned(r.nibs(1)) + 1);
    return o;
  end function;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
use work.rp.all;
entity leaf is port (clk : in std_logic; d : in std_logic_vector(11 downto 0); r_o : out rec_t); end;
architecture a of leaf is signal r : rec_t := REC0; begin
  process (clk) begin if rising_edge(clk) then r <= bump(r); r.dat <= d; r.ok <= not r.ok; end if; end process;
  r_o <= r;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
use work.rp.all;
entity rtop is port (clk : in std_logic; d : in std_logic_vector(11 downto 0); sel : in unsigned(1 downto 0); k : in unsigned(1 downto 0);
                     q_dat : out std_logic_vector(11 downto 0); q_cnt : out unsigned(3 downto 0); q_nib : out std_logic_vector(3 downto 0);
                     q_st : out std_logic_vector(1 downto 0); q_ok : out std_logic; q_tab : out std_logic_vector(11 downto 0)); end;
architecture a of rtop is
  signal arr : rec_arr := TAB;
  signal leafs : rec_arr;
begin
  g : for i in 0 to 1 generate
    u : entity work.leaf port map (clk => clk, d => d, r_o => leafs(i));
  end generate;
  leafs(2) <= TAB(2); leafs(3) <= REC0;
  process (clk)
    variable v : rec_t;
  begin
    if rising_edge(clk) then
      v := arr(to_integer(sel));
      v.nibs(to_integer(k) mod 3) := d(3 downto 0);
      v.dat := v.dat xor leafs(to_integer(k)).dat;
      arr(to_integer(sel)) <= v;
      arr(to_integer(k)).cnt <= leafs(to_integer(sel)).cnt;
    end if;
  end process;
  q_dat <= arr(to_integer(sel)).dat;
  q_cnt <= to_unsigned(arr(to_integer(k)).cnt, 4);
  q_nib <= arr(to_integer(sel)).nibs(to_integer(k) mod 3);
  q_st <= std_logic_vector(to_unsigned(st_t'pos(leafs(to_integer(sel)).st), 2));
  q_ok <= '1' when leafs(to_integer(k)).ok else '0';
  q_tab <= TAB(to_integer(sel)).dat;
end;
