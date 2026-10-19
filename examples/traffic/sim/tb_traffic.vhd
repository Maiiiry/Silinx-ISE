----------------------------------------------------------------------------------
-- Test bench for top: the pedestrian crossing, with a fast timer (TICK = 8 clock cycles per
-- "second") and a fast display (REFRESH = 1: one digit per clock cycle).
-- The lamps (LD7..LD0) and the display are checked on every clock cycle:
--   1. no request: the cars keep their green (20 s)
--   2. a press after the 5 s of green: the yellow 4 clock cycles later (2 synchronising flip-flops,
--      the request latch, the state register), then the exact sequence: yellow 2 s, all red 1 s,
--      walk 5 s (the display counts 8, 7, 6, 5, 4), walk end 3 s (the pedestrians' green blinks at
--      2 Hz; the display counts 3, 2, 1), all red 1 s, and the cars' green again
--   3. a press in the first second of green: the cars keep their green for its 5 s, then the
--      crossing; after it the request is cleared: the cars keep their green
--   4. night mode (SW1): the cars' yellow flashes at 2 Hz, the other lamps and the display are off;
--      back to day: the cars' green
-- Each wrong value is reported as an ERROR; when all of them pass: "Simulation finished OK".
-- The test takes about 12 us of simulated time, longer than ISim's first run: Run All (the clock
-- stops at the end).
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;

ENTITY tb_traffic IS
END tb_traffic;

ARCHITECTURE behavior OF tb_traffic IS
   constant T          : integer := 8;               -- clock cycles per second (TICK)
   constant clk_period : time := 20 ns;
   signal clk : std_logic := '0';
   signal sw  : std_logic_vector(1 downto 0) := "01"; -- SW0: reset
   signal btn : std_logic_vector(0 downto 0) := "0";
   signal led : std_logic_vector(7 downto 0);
   signal seg : std_logic_vector(6 downto 0);
   signal dp  : std_logic;
   signal an  : std_logic_vector(3 downto 0);
   signal done_sim : boolean := false;
   -- the lamps:                                  LD7..LD0 = car red, yellow, green, 0, 0, 0, walk red, green
   constant CARS     : std_logic_vector(7 downto 0) := "00100010";
   constant YELLOW   : std_logic_vector(7 downto 0) := "01000010";
   constant ALL_RED  : std_logic_vector(7 downto 0) := "10000010";
   constant WALK     : std_logic_vector(7 downto 0) := "10000001";
   constant WALK_OFF : std_logic_vector(7 downto 0) := "10000000";   -- walk end, the green blinking
   constant NIGHT    : std_logic_vector(7 downto 0) := "01000000";
   constant DARK     : std_logic_vector(7 downto 0) := "00000000";
   constant BLANK    : integer := 15;
   -- the segments (gfedcba, active low) of the digits 0..9
   type seg_table is array (0 to 9) of std_logic_vector(6 downto 0);
   constant DIGIT : seg_table := ("1000000", "1111001", "0100100", "0110000", "0011001",
                                  "0010010", "0000010", "1111000", "0000000", "0010000");

   function bits(v : std_logic_vector) return string is
      variable s : string(1 to v'length);
      variable k : integer := 1;
   begin
      for i in v'range loop
         if v(i) = '1' then s(k) := '1'; elsif v(i) = '0' then s(k) := '0'; else s(k) := 'X'; end if;
         k := k + 1;
      end loop;
      return s;
   end function;
BEGIN
   uut: entity work.top
      generic map ( TICK => T, REFRESH => 1 )
      port map ( clk => clk, sw => sw, btn => btn, led => led, seg => seg, dp => dp, an => an );

   clk_process : process
   begin
      clk <= '0'; wait for clk_period/2;
      clk <= '1'; wait for clk_period/2;
      if done_sim then wait; end if;
   end process;

   stim_proc: process
      variable errors : integer := 0;   -- the wrong values: check counts them
      -- the lamps and the display now (between two clock edges)
      procedure check(lamps : std_logic_vector(7 downto 0); number : integer; what : string) is
         variable shown : std_logic_vector(6 downto 0);
      begin
         if led /= lamps then
            if errors < 20 then
               report "ERROR: " & what & ": the lamps are " & bits(led) & ", expected " & bits(lamps) severity error;
            end if;
            errors := errors + 1;
         end if;
         shown := "1111111";
         if an = "1110" and number /= BLANK then shown := DIGIT(number); end if;
         if seg /= shown or dp /= '1' or not (an = "1110" or an = "1101" or an = "1011" or an = "0111") then
            if errors < 20 then
               report "ERROR: " & what & ": the display (an " & bits(an) & ") shows " & bits(seg)
                    & ", expected " & bits(shown) severity error;
            end if;
            errors := errors + 1;
         end if;
      end procedure;
      -- n clock cycles of the same lamps and display: checked just before the next rising edge (the outputs
      -- of the placed and routed design change some ns after the clock's edge: its post-place & route model)
      procedure cycles(n : integer; lamps : std_logic_vector(7 downto 0); number : integer; what : string) is
      begin
         for i in 1 to n loop
            wait for clk_period / 2 - 1 ns;
            check(lamps, number, what);
            wait until falling_edge(clk);
         end loop;
      end procedure;
      -- n clock cycles of a blinking lamp (2 Hz: on for T/4 cycles, off for T/4 cycles)
      procedure blinking(n : integer; on_lamps, off_lamps : std_logic_vector(7 downto 0); number : integer;
                         what : string) is
      begin
         for i in 0 to n - 1 loop
            wait for clk_period / 2 - 1 ns;
            if i mod (T / 2) < T / 4 then
               check(on_lamps, number, what);
            else
               check(off_lamps, number, what);
            end if;
            wait until falling_edge(clk);
         end loop;
      end procedure;
      -- the crossing, from its first clock cycle of yellow
      procedure crossing(what : string) is
      begin
         cycles(2 * T, YELLOW, BLANK, what & ", cars yellow");
         cycles(T, ALL_RED, BLANK, what & ", all red");
         for s in 0 to 4 loop
            cycles(T, WALK, 8 - s, what & ", walk, " & integer'image(8 - s) & " s left");
         end loop;
         for s in 0 to 2 loop
            blinking(T, WALK, WALK_OFF, 3 - s, what & ", walk end, " & integer'image(3 - s) & " s left");
         end loop;
         cycles(T, ALL_RED, BLANK, what & ", all red again");
      end procedure;
   begin
      wait for 100 ns;
      wait until falling_edge(clk);
      sw(0) <= '0';                                          -- release the reset
      -- 1. no request: the cars keep their green
      cycles(20 * T, CARS, BLANK, "no request");
      -- 2. a press (2 clock cycles) after the 5 s of green: the yellow 4 clock cycles later
      btn(0) <= '1';
      cycles(2, CARS, BLANK, "a press, before the yellow");
      btn(0) <= '0';
      cycles(2, CARS, BLANK, "a press, before the yellow");
      crossing("first crossing");
      -- 3. the cars' green again; a press in its first second: green for 5 s, then the crossing
      cycles(T, CARS, BLANK, "cars green again");
      btn(0) <= '1';
      cycles(2, CARS, BLANK, "a press in the first second of green");
      btn(0) <= '0';
      cycles(4 * T - 2, CARS, BLANK, "the cars' green lasts 5 s");
      crossing("second crossing");
      -- the request was cleared: the cars keep their green
      cycles(10 * T, CARS, BLANK, "after the crossing (the request cleared)");
      -- 4. night mode: from the cars' green (3 clock cycles: 2 synchronising flip-flops, the state)
      sw(1) <= '1';
      cycles(3, CARS, BLANK, "night switched on");
      blinking(3 * T, NIGHT, DARK, BLANK, "night");
      sw(1) <= '0';                                          -- back to day
      blinking(3, NIGHT, DARK, BLANK, "night switched off");
      cycles(10 * T, CARS, BLANK, "day again");
      if errors = 0 then
         report "Simulation finished OK" severity note;
      else
         report "ERROR: " & integer'image(errors) & " wrong value(s)" severity error;
      end if;
      done_sim <= true;
      wait;
   end process;
END;
