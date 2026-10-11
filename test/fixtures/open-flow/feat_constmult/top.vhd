-- Open-flow board test (Basys2-250): a decimal counter 0000..9999 on the display, its digits from
-- multiplications by a constant (x / 10 = (x * 6554) / 65536: MULT18X18s whose B inputs are tied
-- to 0 and 1), and a memory of 512 counts of 14 bits (a RAMB16 whose word fills one parity bit).
--   sw(0) = 1 stops the counter; btn(1) stores the count at the next free place (LEDs: how many);
--   btn(3) held shows the stored count at sw(7 downto 1) instead.
-- (Issue #35: the multipliers' constant-1 inputs could not be routed on known switches; ISE's DRC
-- warned about the memory's parity bit.)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(7 downto 0);
        btn : in  std_logic_vector(3 downto 0);
        seg : out std_logic_vector(6 downto 0);   -- a..g, active low
        dp  : out std_logic;
        an  : out std_logic_vector(3 downto 0);   -- active low, an(3) = leftmost digit
        led : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  constant RECIP : unsigned(13 downto 0) := to_unsigned(6554, 14);
  function div10 (x : unsigned(13 downto 0)) return unsigned is
    variable p : unsigned(27 downto 0);
  begin
    p := x * RECIP;
    return resize(p(27 downto 16), 14);
  end function;
  function mod10 (x, q : unsigned(13 downto 0)) return unsigned is
    variable t : unsigned(13 downto 0);
  begin
    t := x - ((q(10 downto 0) & "000") + (q(12 downto 0) & '0'));
    return t(3 downto 0);
  end function;

  type mem_t is array (0 to 511) of unsigned(13 downto 0);
  signal mem : mem_t;
  signal cnt   : unsigned(19 downto 0) := (others => '0');
  signal value : unsigned(13 downto 0) := (others => '0');
  signal used  : unsigned(8 downto 0) := (others => '0');
  signal b1    : std_logic_vector(1 downto 0) := "00";
  signal recalled, shown : unsigned(13 downto 0) := (others => '0');
  signal q1, q2, q3 : unsigned(13 downto 0) := (others => '0');
  signal r0, r1, r2, r0d, r0dd, r1d : unsigned(3 downto 0) := (others => '0');
  signal nib  : unsigned(3 downto 0);
  signal s    : std_logic_vector(6 downto 0);
  signal an_r : std_logic_vector(3 downto 0) := "1111";
begin
  process (clk)
    variable q : unsigned(13 downto 0);
  begin
    if rising_edge(clk) then
      cnt <= cnt + 1;
      if cnt = X"FFFFF" and sw(0) = '0' then
        if value = 9999 then value <= (others => '0'); else value <= value + 1; end if;
      end if;
      b1 <= b1(0) & btn(1);
      if b1 = "01" and used /= 511 then
        mem(to_integer(used)) <= value;
        used <= used + 1;
      end if;
      recalled <= mem(to_integer(unsigned(sw(7 downto 1))));
      if btn(3) = '1' then shown <= recalled; else shown <= value; end if;
      -- the four digits, one stage per digit
      q := div10(shown);   q1 <= q; r0 <= mod10(shown, q);
      q := div10(q1);      q2 <= q; r1 <= mod10(q1, q); r0d <= r0;
      q := div10(q2);      q3 <= q; r2 <= mod10(q2, q); r1d <= r1; r0dd <= r0d;
      case cnt(16 downto 15) is
        when "00" => an_r <= "1110";
        when "01" => an_r <= "1101";
        when "10" => an_r <= "1011";
        when others => an_r <= "0111";
      end case;
    end if;
  end process;

  with an_r select nib <=
    r0dd when "1110", r1d when "1101", r2 when "1011", q3(3 downto 0) when others;
  with nib select s <=                    -- gfedcba, 1 = lit
    "0111111" when "0000", "0000110" when "0001", "1011011" when "0010", "1001111" when "0011",
    "1100110" when "0100", "1101101" when "0101", "1111101" when "0110", "0000111" when "0111",
    "1111111" when "1000", "1101111" when "1001", "0000000" when others;
  seg <= not s;
  dp  <= '1';
  an  <= an_r;
  led <= std_logic_vector(used(7 downto 0));
end rtl;
