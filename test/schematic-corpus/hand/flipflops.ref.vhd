library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of flipflops.sch.json (the schematic corpus, #1687): FD, FDC (CLR asynchronous), FDCE, FDRE (R
-- synchronous, over CE), FDPE (PRE asynchronous, INIT 1), FTCE (toggles when T and CE), a register with clock enable
-- and asynchronous clear, an up counter (CE, CLR asynchronous), a down counter (R synchronous).
entity flipflops is
  port (clk, d, ce, clr : in std_logic; dd : in std_logic_vector(3 downto 0);
        q : out std_logic_vector(5 downto 0); rq, up : out std_logic_vector(3 downto 0); dn : out std_logic_vector(2 downto 0));
end flipflops;
architecture ref of flipflops is
  signal q0, q1, q2, q3, q5 : std_logic := '0';
  signal q4 : std_logic := '1';
  signal r, u : unsigned(3 downto 0) := (others => '0');
  signal c : unsigned(2 downto 0) := (others => '0');
begin
  process (clk) begin if rising_edge(clk) then q0 <= d; end if; end process;
  process (clk, clr) begin if clr = '1' then q1 <= '0'; elsif rising_edge(clk) then q1 <= d; end if; end process;
  process (clk, clr) begin if clr = '1' then q2 <= '0'; elsif rising_edge(clk) then if ce = '1' then q2 <= d; end if; end if; end process;
  process (clk) begin if rising_edge(clk) then if clr = '1' then q3 <= '0'; elsif ce = '1' then q3 <= d; end if; end if; end process;
  process (clk, clr) begin if clr = '1' then q4 <= '1'; elsif rising_edge(clk) then if ce = '1' then q4 <= d; end if; end if; end process;
  process (clk, clr) begin if clr = '1' then q5 <= '0'; elsif rising_edge(clk) then if ce = '1' and d = '1' then q5 <= not q5; end if; end if; end process;
  q <= q5 & q4 & q3 & q2 & q1 & q0;
  process (clk, clr) begin if clr = '1' then r <= (others => '0'); elsif rising_edge(clk) then if ce = '1' then r <= unsigned(dd); end if; end if; end process;
  rq <= std_logic_vector(r);
  process (clk, clr) begin if clr = '1' then u <= (others => '0'); elsif rising_edge(clk) then if ce = '1' then u <= u + 1; end if; end if; end process;
  up <= std_logic_vector(u);
  process (clk) begin if rising_edge(clk) then if clr = '1' then c <= (others => '0'); else c <= c - 1; end if; end if; end process;
  dn <= std_logic_vector(c);
end ref;
