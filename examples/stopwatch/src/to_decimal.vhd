----------------------------------------------------------------------------------
-- Silinx example (stopwatch): a binary number 0..9999 to its four decimal digits, without a divider:
-- x / 10, x / 100 and x / 1000 are multiplications by a reciprocal (x * 6554 / 2**16,
-- x * 5243 / 2**19, x * 8389 / 2**23: exact for x up to 9999), on the FPGA's 18 x 18 multipliers.
-- Each digit is then a quotient minus ten times the next one, of which only the last 4 bits count
-- (a digit is less than 16). Two clock cycles: the quotients, then the digits.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity to_decimal is
    Port ( clk    : in  STD_LOGIC;
           value  : in  UNSIGNED (13 downto 0);    -- 0 .. 9999
           digits : out STD_LOGIC_VECTOR (15 downto 0) ); -- thousands & hundreds & tens & units
end to_decimal;

architecture Behavioral of to_decimal is
    -- the last 4 bits of the quotients and of the value (registered)
    signal q1, q2, q3, v : UNSIGNED (3 downto 0) := (others => '0');
    signal d0, d1, d2, d3 : UNSIGNED (3 downto 0) := (others => '0');

    -- the last 4 bits of x * recip / 2**shift (a multiplier)
    function quotient (x : UNSIGNED (13 downto 0); recip : integer; shift : integer) return UNSIGNED is
        variable p : UNSIGNED (27 downto 0);
    begin
        p := x * to_unsigned(recip, 14);
        return p(shift + 3 downto shift);
    end function;

    -- ten times a 4-bit number, modulo 16: 8 x + 2 x
    function times10 (x : UNSIGNED (3 downto 0)) return UNSIGNED is
    begin
        return (x(0 downto 0) & "000") + (x(2 downto 0) & '0');
    end function;
begin
    process (clk)
    begin
        if rising_edge(clk) then
            -- the quotients' and the value's last 4 bits
            q1 <= quotient(value, 6554, 16);
            q2 <= quotient(value, 5243, 19);
            q3 <= quotient(value, 8389, 23);
            v  <= value(3 downto 0);
            -- the digits
            d0 <= v - times10(q1);
            d1 <= q1 - times10(q2);
            d2 <= q2 - times10(q3);
            d3 <= q3;
        end if;
    end process;
    digits <= std_logic_vector(d3) & std_logic_vector(d2) & std_logic_vector(d1) & std_logic_vector(d0);
end Behavioral;
