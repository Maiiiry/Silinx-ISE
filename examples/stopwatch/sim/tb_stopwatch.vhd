----------------------------------------------------------------------------------
-- Test bench for stopwatch: fast generics (a hundredth every 2 clock cycles, a 2-cycle debounce,
-- 2 cycles per display digit). Reads the time off the 7-segment display, as a person would: it runs
-- for 12.34 s and stops (the display stays), runs on with two laps, recalls them (LD7..LD0: the lap
-- number) and goes back to the running time, then clears.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity tb_stopwatch is
end tb_stopwatch;

architecture behavior of tb_stopwatch is
    constant CS : integer := 2;
    constant clk_period : time := 20 ns;
    signal clk : STD_LOGIC := '0';
    signal sw  : STD_LOGIC_VECTOR (0 downto 0) := "1";
    signal btn : STD_LOGIC_VECTOR (3 downto 0) := "0000";
    signal led : STD_LOGIC_VECTOR (7 downto 0);
    signal seg : STD_LOGIC_VECTOR (6 downto 0);
    signal dp  : STD_LOGIC;
    signal an  : STD_LOGIC_VECTOR (3 downto 0);

    -- the digit a segment pattern shows (-1: blank, -2: not a digit)
    function digit_of (s : STD_LOGIC_VECTOR (6 downto 0)) return integer is
    begin
        case s is
            when "1000000" => return 0;
            when "1111001" => return 1;
            when "0100100" => return 2;
            when "0110000" => return 3;
            when "0011001" => return 4;
            when "0010010" => return 5;
            when "0000010" => return 6;
            when "1111000" => return 7;
            when "0000000" => return 8;
            when "0010000" => return 9;
            when "1111111" => return -1;
            when others => return -2;
        end case;
    end function;
begin
    uut: entity work.stopwatch
        generic map ( CS => CS, STABLE => 2, REFRESH => 2 )
        port map ( clk => clk, sw => sw, btn => btn, led => led, seg => seg, dp => dp, an => an );

    clk <= not clk after clk_period / 2;

    stim: process
        variable errors : integer := 0;
        variable v, l1, l2, live : integer;

        procedure press (b : integer) is
        begin
            btn(b) <= '1'; wait for clk_period * 6;
            btn(b) <= '0'; wait for clk_period * 6;
        end procedure;

        procedure hundredths (n : integer) is
        begin
            wait for clk_period * CS * n;
        end procedure;

        -- the number on the display (digit 3 blank: a leading zero); the decimal point after digit 2
        procedure read_display (value : out integer) is
            variable d, total : integer;
        begin
            total := 0;
            for i in 3 downto 0 loop
                wait until rising_edge(clk) and an = not std_logic_vector(to_unsigned(2 ** i, 4)) for clk_period * 20;
                wait for 1 ns;
                d := digit_of(seg);
                if d = -1 and i = 3 then d := 0; end if;
                if d < 0 then
                    report "digit " & integer'image(i) & " is not a digit" severity error;
                    errors := errors + 1; d := 0;
                end if;
                if (dp = '0') /= (i = 2) then
                    report "decimal point wrong on digit " & integer'image(i) severity error;
                    errors := errors + 1;
                end if;
                total := total * 10 + d;
            end loop;
            value := total;
        end procedure;

        procedure expect (v, lo, hi : integer; what : string) is
        begin
            if v < lo or v > hi then
                report what & ": " & integer'image(v) & ", expected " & integer'image(lo) & " .. " & integer'image(hi) severity error;
                errors := errors + 1;
            end if;
        end procedure;
    begin
        wait for clk_period * 4;
        sw <= "0";
        wait for clk_period * 4;
        read_display(v);
        expect(v, 0, 0, "after reset");
        -- 12.34 s, then stop
        press(0);
        hundredths(1234 - 6);                   -- (the press itself took 12 cycles: 6 hundredths)
        press(0);
        read_display(v);
        expect(v, 1232, 1236, "stopped at 12.34");
        hundredths(100);
        read_display(live);
        expect(live, v, v, "stopped: the time stays");
        -- run on, two laps
        press(0);
        hundredths(100);
        press(1);
        hundredths(50);
        press(1);
        if led /= "00000010" then report "two laps: LEDs " & integer'image(to_integer(unsigned(led))) severity error; errors := errors + 1; end if;
        hundredths(20);
        press(0);
        read_display(live);
        expect(live, v + 170, v + 190, "running time after the laps");
        -- recall the laps
        press(3);
        if led /= "00000001" then report "recall: lap 1 on the LEDs" severity error; errors := errors + 1; end if;
        read_display(l1);
        expect(l1, v + 100, v + 115, "lap 1");
        press(3);
        if led /= "00000010" then report "recall: lap 2 on the LEDs" severity error; errors := errors + 1; end if;
        read_display(l2);
        expect(l2, l1 + 50, l1 + 62, "lap 2");
        press(3);                               -- after the last lap: the running time
        read_display(v);
        expect(v, live, live, "back to the time");
        if led /= "00000010" then report "back: the lap count on the LEDs" severity error; errors := errors + 1; end if;
        -- a lap while stopped is not stored; clear
        press(1);
        if led /= "00000010" then report "a lap while stopped was stored" severity error; errors := errors + 1; end if;
        press(2);
        read_display(v);
        expect(v, 0, 0, "cleared");
        if led /= "00000000" then report "cleared: the laps" severity error; errors := errors + 1; end if;
        if errors = 0 then
            report "Simulation finished OK" severity note;
        else
            report "ERROR: " & integer'image(errors) & " check(s) failed" severity error;
        end if;
        wait;
    end process;
end behavior;
