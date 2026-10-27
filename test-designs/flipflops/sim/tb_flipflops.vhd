----------------------------------------------------------------------------------
-- Test bench for flipflops (src/flipflops.sch.json): Xilinx's flip-flops, a
-- register and counters, on the clock clk (through a BUFG).
--   q(0) FD    q <= d
--   q(1) FDC   q <= d, cleared at once by clr (asynchronous)
--   q(2) FDCE  q <= d when ce, cleared at once by clr
--   q(3) FDRE  q <= d when ce, cleared by clr at the clock edge (synchronous)
--   q(4) FDPE  q <= d when ce, set to 1 at once by clr (its PRE)
--   q(5) FTCE  toggles when ce and d (its T), cleared at once by clr
--   rq   a register: rq <= dd when ce, cleared at once by clr
--   up   an up counter: +1 when ce, cleared at once by clr
--   dn   a down counter: -1 at every edge, cleared by clr at the edge
-- 300 clock cycles of pseudo-random d, ce, clr and dd (an LFSR; clr seldom, and
-- in the first cycle, which makes every output known). A model of the above, kept
-- in variables, is compared with the outputs after each rising edge and before
-- the next (the asynchronous clears seen at once). Each mismatch is reported as
-- an ERROR; when all of them pass: "Simulation finished OK". (A Silinx test
-- design, #1746.)
----------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_flipflops is
end tb_flipflops;

architecture behavior of tb_flipflops is
  signal clk, d, ce, clr : std_logic := '0';
  signal dd : std_logic_vector(3 downto 0) := (others => '0');
  signal q : std_logic_vector(5 downto 0);
  signal rq, up : std_logic_vector(3 downto 0);
  signal dn : std_logic_vector(2 downto 0);
begin
  uut: entity work.flipflops
    port map (clk => clk, d => d, ce => ce, clr => clr, dd => dd, q => q, rq => rq, up => up, dn => dn);

  stim: process
    variable errors : integer := 0;
    variable lfsr : std_logic_vector(15 downto 0) := x"ACE1";
    variable eq : std_logic_vector(5 downto 0) := (others => '0');
    variable er, eu : unsigned(3 downto 0) := (others => '0');
    variable ec : unsigned(2 downto 0) := (others => '0');

    procedure check(k : integer; what : string) is
    begin
      if q /= eq or rq /= std_logic_vector(er) or up /= std_logic_vector(eu) or dn /= std_logic_vector(ec) then
        report "ERROR: cycle " & integer'image(k) & ", " & what & ": wrong outputs" severity error;
        errors := errors + 1;
      end if;
    end procedure;
  begin
    for k in 0 to 299 loop
      -- the inputs of this cycle, while clk is 0
      for i in 1 to 5 loop
        lfsr := lfsr(14 downto 0) & (lfsr(15) xor lfsr(13) xor lfsr(12) xor lfsr(10));
      end loop;
      d <= lfsr(0);
      ce <= lfsr(1) or lfsr(2);
      if k = 0 or lfsr(7 downto 4) = "0000" then clr <= '1'; else clr <= '0'; end if;
      dd <= lfsr(11 downto 8);
      wait for 5 ns;
      -- the asynchronous clears (FDC, FDCE, FDPE's preset, FTCE, the register, the up counter)
      if clr = '1' then
        eq(1) := '0'; eq(2) := '0'; eq(4) := '1'; eq(5) := '0';
        er := (others => '0'); eu := (others => '0');
      end if;
      if k > 0 then check(k, "before the edge"); end if;
      clk <= '1';
      wait for 5 ns;
      -- the rising edge
      eq(0) := d;
      if clr = '0' then
        eq(1) := d;
        if ce = '1' then
          eq(2) := d; eq(4) := d;
          if d = '1' then eq(5) := not eq(5); end if;
          er := unsigned(dd); eu := eu + 1;
        end if;
      end if;
      if clr = '1' then eq(3) := '0'; elsif ce = '1' then eq(3) := d; end if;
      if clr = '1' then ec := (others => '0'); else ec := ec - 1; end if;
      check(k, "after the edge");
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
