----------------------------------------------------------------------------------
-- Silinx example (blinky): a 4-digit decimal (BCD) counter, 0000 to 9999 and then 0000 again,
-- one count on each `inc` pulse. Each digit counts 0..9 and carries into the next one when it
-- goes from 9 back to 0: the ones, the tens, the hundreds and the thousands.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity bcd_counter is
    Port ( clk    : in  STD_LOGIC;
           rst    : in  STD_LOGIC;
           inc    : in  STD_LOGIC;
           digits : out STD_LOGIC_VECTOR (15 downto 0) ); -- thousands & hundreds & tens & ones
end bcd_counter;

architecture Behavioral of bcd_counter is
    signal ones, tens, hundreds, thousands : UNSIGNED (3 downto 0) := (others => '0');
begin
    process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                ones <= (others => '0'); tens <= (others => '0');
                hundreds <= (others => '0'); thousands <= (others => '0');
            elsif inc = '1' then
                if ones /= 9 then
                    ones <= ones + 1;
                else                                   -- 9 -> 0: carry into the tens
                    ones <= (others => '0');
                    if tens /= 9 then
                        tens <= tens + 1;
                    else                               -- 99 -> 00: carry into the hundreds
                        tens <= (others => '0');
                        if hundreds /= 9 then
                            hundreds <= hundreds + 1;
                        else                           -- 999 -> 000: carry into the thousands
                            hundreds <= (others => '0');
                            if thousands /= 9 then
                                thousands <= thousands + 1;
                            else                       -- 9999 -> 0000
                                thousands <= (others => '0');
                            end if;
                        end if;
                    end if;
                end if;
            end if;
        end if;
    end process;

    digits <= std_logic_vector(thousands) & std_logic_vector(hundreds) & std_logic_vector(tens) & std_logic_vector(ones);
end Behavioral;
