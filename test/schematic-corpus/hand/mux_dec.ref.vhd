library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of mux_dec.sch.json (the schematic corpus, #1687): M8_1 with its enable (0 when E = 0), the decoder
-- with its enable, the priority encoder (the highest input wins, V = some input is 1), the 1:2 demultiplexer.
entity mux_dec is
  port (dd : in std_logic_vector(7 downto 0); s : in std_logic_vector(2 downto 0); en : in std_logic;
        m2 : out std_logic_vector(1 downto 0); m4, m8 : out std_logic; dec : out std_logic_vector(3 downto 0);
        enc : out std_logic_vector(1 downto 0); v : out std_logic; dm : out std_logic_vector(1 downto 0));
end mux_dec;
architecture ref of mux_dec is
begin
  m2 <= dd(3 downto 2) when s(0) = '1' else dd(1 downto 0);
  m4 <= dd(4 + to_integer(unsigned(s(1 downto 0))));
  m8 <= dd(to_integer(unsigned(s))) and en;
  process (s, en)
  begin
    dec <= (others => '0');
    if en = '1' then dec(to_integer(unsigned(s(1 downto 0)))) <= '1'; end if;
  end process;
  enc <= "11" when dd(7) = '1' else "10" when dd(6) = '1' else "01" when dd(5) = '1' else "00";
  v <= dd(7) or dd(6) or dd(5) or dd(4);
  dm <= (en and s(0)) & (en and not s(0));
end ref;
