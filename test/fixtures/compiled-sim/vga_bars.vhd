-- Silinx test design (VGA monitor, #420): 640x480 at 60 Hz from a 50 MHz clock (a pixel every DIV
-- cycles), its timing in generics (to make it wrong): eight red bars across, eight green bands down, a
-- blue 32x32 square at column 8 * sw, row 200; black outside the picture.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity vga_bars is
    Generic ( H_FRONT : integer := 16; H_SYNC : integer := 96; H_BACK : integer := 48;
              V_FRONT : integer := 10; V_SYNC : integer := 2; V_BACK : integer := 33;
              ACTIVE_HIGH : integer := 0; DIV : integer := 2 );
    Port ( clk   : in  STD_LOGIC;
           sw    : in  STD_LOGIC_VECTOR (7 downto 0);
           hsync, vsync : out STD_LOGIC;
           red, green   : out STD_LOGIC_VECTOR (2 downto 0);
           blue  : out STD_LOGIC_VECTOR (1 downto 0));
end vga_bars;

architecture Behavioral of vga_bars is
    constant H_TOTAL : integer := 640 + H_FRONT + H_SYNC + H_BACK;
    constant V_TOTAL : integer := 480 + V_FRONT + V_SYNC + V_BACK;
    signal tick : integer range 0 to DIV - 1 := 0;
    signal hc : integer range 0 to H_TOTAL - 1 := 0;
    signal vc : integer range 0 to V_TOTAL - 1 := 0;
    signal pol : std_logic;
begin
    pol <= '1' when ACTIVE_HIGH = 1 else '0';
    process (clk)
        variable sq : integer range 0 to 2047;
    begin
        if rising_edge(clk) then
            if tick = DIV - 1 then
                tick <= 0;
                if hc = H_TOTAL - 1 then
                    hc <= 0;
                    if vc = V_TOTAL - 1 then vc <= 0; else vc <= vc + 1; end if;
                else
                    hc <= hc + 1;
                end if;
                -- the outputs of the pixel (hc, vc), registered
                if hc >= 640 + H_FRONT and hc < 640 + H_FRONT + H_SYNC then hsync <= pol; else hsync <= not pol; end if;
                if vc >= 480 + V_FRONT and vc < 480 + V_FRONT + V_SYNC then vsync <= pol; else vsync <= not pol; end if;
                sq := 8 * to_integer(unsigned(sw));
                if hc < 640 and vc < 480 then
                    red <= std_logic_vector(to_unsigned(hc / 80, 3));
                    green <= std_logic_vector(to_unsigned(vc / 60, 3));
                    if hc >= sq and hc < sq + 32 and vc >= 200 and vc < 232 then blue <= "11"; else blue <= "00"; end if;
                else
                    red <= "000"; green <= "000"; blue <= "00";
                end if;
            else
                tick <= tick + 1;
            end if;
        end if;
    end process;
end Behavioral;
