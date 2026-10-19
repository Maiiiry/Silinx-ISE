----------------------------------------------------------------------------------
-- Test bench for vga: looks at the VGA signals as a monitor would. The sync timing: a line of 800
-- pixels (32 us at 25 MHz) with an HSYNC pulse of 96, a frame of 525 lines with a VSYNC pulse of 2,
-- both active low, the pulses where 640x480 at 60 Hz has them around the picture (the white frame's
-- first and last pixels, the black porches). The colours of a few pixels: the bars, the square in
-- their opposite colours, black in the blanking; the next frame 525 lines after. The buttons: with SW0
-- on, the square moves four pixels a frame, right and down. (Two frames: about 26 ms of simulated time;
-- in ISim, Run for 30 ms.)
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity tb_vga is
end tb_vga;

architecture behavior of tb_vga is
    constant clk_period : time := 20 ns;
    constant PX   : time := 40 ns;                 -- a pixel: two clock cycles
    constant LINE : integer := 800;                -- pixels a line
    constant WHITE   : STD_LOGIC_VECTOR (7 downto 0) := "11111111";
    constant YELLOW  : STD_LOGIC_VECTOR (7 downto 0) := "11111100";
    constant CYAN    : STD_LOGIC_VECTOR (7 downto 0) := "00011111";
    constant GREEN   : STD_LOGIC_VECTOR (7 downto 0) := "00011100";
    constant MAGENTA : STD_LOGIC_VECTOR (7 downto 0) := "11100011";
    constant RED     : STD_LOGIC_VECTOR (7 downto 0) := "11100000";
    constant BLUE    : STD_LOGIC_VECTOR (7 downto 0) := "00000011";
    constant BLACK   : STD_LOGIC_VECTOR (7 downto 0) := "00000000";
    signal clk : STD_LOGIC := '0';
    signal sw  : STD_LOGIC_VECTOR (0 downto 0) := "0";
    signal btn : STD_LOGIC_VECTOR (3 downto 0) := "0000";
    signal vga_red, vga_green : STD_LOGIC_VECTOR (2 downto 0);
    signal vga_blue : STD_LOGIC_VECTOR (1 downto 0);
    signal vga_hsync, vga_vsync : STD_LOGIC;
    -- the time of the first frame's first pixel (0, 0), from its first HSYNC pulse (at pixel 656)
    signal origin : time := 0 ns;
    signal timing_done : boolean := false;
    signal timing_errors : integer := 0;
begin
    uut: entity work.vga
        port map ( clk => clk, sw => sw, btn => btn, vga_red => vga_red, vga_green => vga_green, vga_blue => vga_blue,
                   vga_hsync => vga_hsync, vga_vsync => vga_vsync );

    clk <= not clk after clk_period / 2;

    -- the sync pulses: their periods, widths and positions
    timing: process
        variable errors : integer := 0;
        variable t : time;

        procedure expect (got, want : time; what : string) is
        begin
            if got /= want then
                report what & ": " & time'image(got) & ", expected " & time'image(want) severity error;
                errors := errors + 1;
            end if;
        end procedure;
    begin
        wait until falling_edge(vga_hsync);
        t := now;
        origin <= now - 656 * PX;
        wait until rising_edge(vga_hsync);
        expect(now - t, 96 * PX, "HSYNC pulse");
        wait until falling_edge(vga_hsync);
        expect(now - t, LINE * PX, "line (HSYNC to HSYNC)");
        -- VSYNC: at the start of line 490, for 2 lines (the frame's 525 lines: the pixels of the next one)
        wait until falling_edge(vga_vsync);
        t := now;
        if abs (now - origin - 490 * LINE * PX) > PX / 4 then expect(now - origin, 490 * LINE * PX, "VSYNC after the frame's first pixel"); end if;   -- (two outputs: their skew)
        if vga_hsync /= '1' then report "HSYNC low at the start of VSYNC" severity error; errors := errors + 1; end if;
        wait until rising_edge(vga_vsync);
        expect(now - t, 2 * LINE * PX, "VSYNC pulse");
        timing_errors <= errors;
        timing_done <= true;
        wait;
    end process;

    -- the pixels, in the order they come
    stim: process
        variable errors : integer := 0;

        -- the colour of pixel (x, y) of frame f (0: the first), seen in the middle of the pixel
        procedure pixel (f, x, y : integer; want : STD_LOGIC_VECTOR (7 downto 0); what : string) is
            variable got : STD_LOGIC_VECTOR (7 downto 0);
        begin
            wait for origin + ((f * 525 + y) * LINE + x) * PX + PX / 2 - now;
            got := vga_red & vga_green & vga_blue;
            if got /= want then
                report what & " at (" & integer'image(x) & ", " & integer'image(y) & ") of frame " & integer'image(f)
                    & ": wrong colour" severity error;
                errors := errors + 1;
            end if;
        end procedure;
    begin
        wait until falling_edge(vga_hsync);
        wait for 1 ns;
        -- the frame's edges: the picture 144 pixels after the start of HSYNC, its last pixel 16 before
        pixel(0, 799, 0, BLACK, "back porch");
        pixel(0, 0, 1, WHITE, "the frame, left");
        pixel(0, 1, 1, WHITE, "the frame, top");
        pixel(0, 639, 1, WHITE, "the frame, right");
        pixel(0, 640, 1, BLACK, "front porch");
        -- the bars
        pixel(0, 40, 100, WHITE, "bar 0");
        pixel(0, 120, 100, YELLOW, "bar 1");
        pixel(0, 200, 100, CYAN, "bar 2");
        pixel(0, 280, 100, GREEN, "bar 3");
        pixel(0, 360, 100, MAGENTA, "bar 4");
        pixel(0, 440, 100, RED, "bar 5");
        pixel(0, 520, 100, BLUE, "bar 6");
        pixel(0, 600, 100, BLACK, "bar 7");
        pixel(0, 639, 100, WHITE, "the frame, right");
        -- the square, at (304, 224) to (335, 255): the opposite colours of bars 3 (green) and 4 (magenta)
        pixel(0, 320, 223, MAGENTA, "above the square");
        pixel(0, 320, 224, GREEN, "the square's top");
        pixel(0, 303, 240, GREEN, "left of the square");
        pixel(0, 304, 240, MAGENTA, "the square's left");
        pixel(0, 335, 240, GREEN, "the square's right");
        pixel(0, 336, 240, MAGENTA, "right of the square");
        pixel(0, 320, 255, GREEN, "the square's bottom");
        pixel(0, 320, 256, MAGENTA, "below the square");
        -- BTN0 and BTN1 held over the end of the picture, SW0 on: four pixels right and four down
        sw <= "1";
        btn <= "0011";
        pixel(0, 100, 479, WHITE, "the frame, bottom");
        pixel(0, 100, 480, BLACK, "vertical blanking");
        pixel(0, 100, 524, BLACK, "vertical blanking, the last line");
        btn <= "0000";
        -- the next frame: 525 lines after the first (its top line white, the next one the bars)
        pixel(1, 100, 0, WHITE, "the next frame, top");
        pixel(1, 100, 1, YELLOW, "the next frame, bar 1");
        pixel(1, 320, 227, MAGENTA, "BTN0, BTN1, SW0: above the square");
        pixel(1, 320, 228, GREEN, "BTN0, BTN1, SW0: the square's top");
        pixel(1, 307, 240, GREEN, "BTN0, BTN1, SW0: left of the square");
        pixel(1, 308, 240, MAGENTA, "BTN0, BTN1, SW0: the square's left");
        pixel(1, 339, 240, GREEN, "BTN0, BTN1, SW0: the square's right");
        pixel(1, 340, 240, MAGENTA, "BTN0, BTN1, SW0: right of the square");
        pixel(1, 320, 259, GREEN, "BTN0, BTN1, SW0: the square's bottom");
        pixel(1, 320, 260, MAGENTA, "BTN0, BTN1, SW0: below the square");
        if not timing_done then wait until timing_done; end if;
        errors := errors + timing_errors;
        if errors = 0 then
            report "Simulation finished OK" severity note;
        else
            report "ERROR: " & integer'image(errors) & " check(s) failed" severity error;
        end if;
        wait;
    end process;
end behavior;
