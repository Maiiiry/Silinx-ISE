----------------------------------------------------------------------------------
-- Silinx example: blinky for the Digilent Basys2 (Spartan-3E XC3S250E-CP132).
-- Mixed-language design: VHDL top, pattern generator and BCD counter + Verilog prescaler and display.
--   clk  : 50 MHz MCLK oscillator (B8, default JP4 setting)
--   sw   : sw(0) = reset, sw(1) = mode (0 = knight rider, 1 = binary counter),
--          sw(2) = pause, sw(3) = invert the LEDs
--   btn  : btn(1) = faster, btn(0) = slower (8 speeds, from 80 to 0.6 steps per second;
--          the speed control is the ASM chart speed_ctrl.asm.json: button synchronisers,
--          debouncers, speed state machine and step divider in one chart)
--   led  : LD0..LD7
--   display: the steps of the LED pattern, counted in decimal from 0000 to 9999 (then 0000 again;
--          sw(0) resets it, a pause stops it): the BCD counter bcd_counter.vhd on the 4-digit
--          7-segment display, multiplexed by sevenseg.v (one digit per ms)
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
    Generic ( DIV      : integer := 625_000;     -- base tick: 80 per second at 50 MHz
              DEBOUNCE : integer := 1_000_000;   -- button debounce: 20 ms at 50 MHz
              REFRESH  : integer := 50_000 );    -- display: cycles per digit (1 ms at 50 MHz)
    -- speed after reset: level 5 of speed_ctrl = 80 / 2**5 = 2.5 steps per second
    Port ( clk : in  STD_LOGIC;
           sw  : in  STD_LOGIC_VECTOR (3 downto 0);
           btn : in  STD_LOGIC_VECTOR (1 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);  -- the display: segments g..a, active low
           dp  : out STD_LOGIC;                      -- decimal point (off)
           an  : out STD_LOGIC_VECTOR (3 downto 0)); -- digit anodes, active low
end top;

architecture Structural of top is
    component prescaler
        generic ( DIV : integer );
        port ( clk : in std_logic; rst : in std_logic; tick : out std_logic );
    end component;
    component sevenseg
        generic ( REFRESH : integer );
        port ( clk : in std_logic; digits : in std_logic_vector(15 downto 0); points : in std_logic_vector(3 downto 0);
               seg : out std_logic_vector(6 downto 0); dp : out std_logic; an : out std_logic_vector(3 downto 0) );
    end component;
    signal tick, speed_step, step : std_logic;
    signal leds       : std_logic_vector(7 downto 0);
    signal digits     : std_logic_vector(15 downto 0);
begin
    u_pre : prescaler
        generic map ( DIV => DIV )
        port map ( clk => clk, rst => sw(0), tick => tick );

    u_speed : entity work.speed_ctrl
        generic map ( DEBOUNCE => DEBOUNCE )
        port map ( clk => clk, rst => sw(0), faster => btn(1), slower => btn(0),
                   tick => tick, step => speed_step );

    u_knight : entity work.knight
        port map ( clk => clk, rst => sw(0), step => step, mode => sw(1), leds => leds );

    u_count : entity work.bcd_counter
        port map ( clk => clk, rst => sw(0), inc => step, digits => digits );

    u_display : sevenseg
        generic map ( REFRESH => REFRESH )
        port map ( clk => clk, digits => digits, points => "0000", seg => seg, dp => dp, an => an );

    step <= speed_step and not sw(2);                -- sw(2): pause
    led  <= leds xor (7 downto 0 => sw(3));          -- sw(3): invert
end Structural;
