----------------------------------------------------------------------------------
-- Test bench for top: a small DIV (base tick every 2 clock cycles) and a 2-cycle button
-- debounce. After reset the speed is level 5: the LEDs move every 2 * 2**5 = 64 cycles.
-- Checks the knight rider, the binary counter, pause, invert and the speed buttons
-- (the speed_ctrl ASM chart: one level per press, limited to levels 0..7).
-- The display (a digit every REFRESH = 4 cycles): the steps of the LED pattern in decimal,
-- one digit at a time; the count, the pause, the wrap from 9999 to 0000 and the reset.
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY tb_top IS
END tb_top;

ARCHITECTURE behavior OF tb_top IS
   signal clk : std_logic := '0';
   signal sw  : std_logic_vector(3 downto 0) := "0001";
   signal btn : std_logic_vector(1 downto 0) := "00";
   signal led : std_logic_vector(7 downto 0);
   signal seg : std_logic_vector(6 downto 0);
   signal dp  : std_logic;
   signal an  : std_logic_vector(3 downto 0);
   constant clk_period : time := 20 ns;
BEGIN
   uut: entity work.top
      generic map ( DIV => 2, DEBOUNCE => 2, REFRESH => 4 )
      port map ( clk => clk, sw => sw, btn => btn, led => led, seg => seg, dp => dp, an => an );

   clk_process : process
   begin
      clk <= '0'; wait for clk_period/2;
      clk <= '1'; wait for clk_period/2;
   end process;

   stim_proc: process
      variable snap : std_logic_vector(7 downto 0);
      variable a, n : integer;
      variable shown : integer;
      -- the digit a segment pattern shows (gfedcba, active low), -1 if none
      function digit_of(s : std_logic_vector(6 downto 0)) return integer is
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
            when others    => return -1;
         end case;
      end function;
      -- the number on the display: each digit read while its anode (alone) is low
      procedure read_display(value : out integer) is
         variable v, d : integer;
         variable anode : std_logic_vector(3 downto 0);
      begin
         v := 0;
         for i in 0 to 3 loop                        -- the units first: the order of the scan
            anode := (others => '1'); anode(i) := '0';
            wait until an = anode for clk_period * 40;
            assert an = anode report "digit " & integer'image(i) & " not shown" severity error;
            wait until falling_edge(clk);            -- (the middle of the digit's 4 cycles, between two
            wait until falling_edge(clk);            -- rising edges: the anodes change a little after one)
            d := digit_of(seg);
            assert d >= 0 report "digit " & integer'image(i) & ": not a decimal digit" severity error;
            assert dp = '1' report "the decimal point is lit" severity error;
            v := v + d * 10 ** i;
         end loop;
         value := v;
      end procedure;
      -- wait (at most `cycles` clock cycles) until the left digit shows `d`
      procedure thousands(d, cycles : integer) is
         variable t0 : time;
      begin
         t0 := now;
         loop
            wait until an = "0111" for clk_period * 40;
            wait until falling_edge(clk);            -- (the segments follow the anodes)
            wait until falling_edge(clk);
            exit when digit_of(seg) = d or now - t0 > clk_period * cycles;
         end loop;
      end procedure;
      -- press and release a button (held long enough for the debounce)
      procedure press(signal b : out std_logic) is
      begin
         b <= '1'; wait for clk_period * 8;
         b <= '0'; wait for clk_period * 8;
      end procedure;
      -- binary counter steps in `cycles` clock cycles must be `expect` (+-1: phase of the window)
      procedure check_rate(cycles, expect : integer; what : string) is
         variable s0, d : integer;
      begin
         s0 := to_integer(unsigned(led));
         wait for clk_period * cycles;
         d := (to_integer(unsigned(led)) - s0) mod 256;
         assert abs (d - expect) <= 1
            report what & ": expected " & integer'image(expect) & " steps, got " & integer'image(d) severity error;
      end procedure;
   begin
      wait for 100 ns;
      sw(0) <= '0';                                   -- release reset
      -- knight rider: the light runs to the MSB and comes back (a step every 64 cycles)
      wait until led = "10000000" for clk_period * 64 * 9;
      assert led = "10000000" report "knight rider did not reach the MSB" severity error;
      wait until led = "00000001" for clk_period * 64 * 9;
      assert led = "00000001" report "knight rider did not come back" severity error;
      read_display(shown);                            -- 7 steps there and 7 back
      assert shown = 14 report "display: expected 14 steps, got " & integer'image(shown) severity error;
      sw(1) <= '1';                                   -- binary counter mode
      wait for clk_period * 40;
      sw(2) <= '1';                                   -- pause: the counter must hold
      wait for clk_period * 2;
      snap := led;
      wait for clk_period * 160;
      assert led = snap report "pause did not hold the LEDs" severity error;
      read_display(shown);                            -- the knight's binary counter counts every step too
      assert shown mod 256 = to_integer(unsigned(snap))
         report "display: " & integer'image(shown) & " steps, the LEDs " & integer'image(to_integer(unsigned(snap))) severity error;
      wait for clk_period * 160;
      read_display(n);
      assert n = shown report "pause did not hold the display" severity error;
      sw(3) <= '1';                                   -- invert
      wait for clk_period;                            -- (the pads and the logic: up to ~10 ns, post-place & route)
      assert led = not snap report "invert did not invert the LEDs" severity error;
      sw(3) <= '0'; sw(2) <= '0';
      wait for clk_period * 2;
      -- speed buttons
      check_rate(640, 10, "level 5 (reset)");         -- 64 cycles per step
      press(btn(0));                                  -- slower: level 6, 128 cycles per step
      check_rate(640, 5, "slower");
      press(btn(1)); press(btn(1));                   -- faster x2: level 4, 32 cycles per step
      check_rate(640, 20, "faster x2");
      for i in 1 to 4 loop press(btn(1)); end loop;   -- faster x4: stops at level 0, 2 cycles
      check_rate(320, 160, "fastest (level 0)");
      for i in 1 to 9 loop press(btn(0)); end loop;   -- slower x9: stops at level 7, 256 cycles
      check_rate(1024, 4, "slowest (level 7)");
      -- the display wraps from 9999 to 0000: at the fastest speed, the thousands go from 9 to 0
      for i in 1 to 7 loop press(btn(1)); end loop;   -- level 0: a step every 2 cycles
      thousands(9, 22000);
      assert digit_of(seg) = 9 report "display: the thousands did not reach 9" severity error;
      thousands(0, 2200);
      assert digit_of(seg) = 0 report "display: 9999 did not wrap to 0000" severity error;
      wait for clk_period * 100;                      -- about 50 steps more
      read_display(shown);
      assert shown > 0 and shown < 100 report "display: did not count on from 0000, " & integer'image(shown) severity error;
      sw(0) <= '1';                                   -- reset: the display shows 0000
      wait for clk_period * 2;
      read_display(shown);
      assert shown = 0 report "display: reset did not clear the count" severity error;
      report "Simulation finished OK" severity note;
      wait;
   end process;
END;
