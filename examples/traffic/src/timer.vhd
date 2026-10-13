----------------------------------------------------------------------------------
-- Silinx example (traffic): the timer of the pedestrian crossing. It measures how long the
-- present phase (the state of the state diagram traffic.fsm.json, its code `phase`) has lasted:
--   done  : the phase has lasted its time (high in its last clock cycle; in CARS it then stays
--           high, as the cars keep their green until a pedestrian asks to cross)
--   blink : 2 Hz: on in the first and third quarter of each second (WALK_END, NIGHT)
--   left  : the seconds left to cross (WALK: 8 to 4, WALK_END: 3 to 1), 0 in the other phases
-- A new phase starts the count again: the timer keeps the phase it is timing (`timed`), and when
-- `phase` is not that one this clock cycle is the first of a new phase (all its counts 0).
-- Plain VHDL: counters (clock cycles in a quarter of a second, quarters, seconds) and the length
-- of each phase in a table (the constants below).
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity timer is
    Generic ( TICK : integer := 50_000_000 );       -- clock cycles per second (a multiple of 4)
    Port ( clk   : in  STD_LOGIC;
           rst   : in  STD_LOGIC;
           phase : in  STD_LOGIC_VECTOR (2 downto 0);
           done  : out STD_LOGIC;
           blink : out STD_LOGIC;
           left  : out STD_LOGIC_VECTOR (3 downto 0) );
end timer;

architecture Behavioral of timer is
    -- the phase codes of the state diagram (its output phase)
    constant CARS        : STD_LOGIC_VECTOR (2 downto 0) := "000";
    constant CARS_YELLOW : STD_LOGIC_VECTOR (2 downto 0) := "001";
    constant ALL_RED     : STD_LOGIC_VECTOR (2 downto 0) := "010";
    constant WALK        : STD_LOGIC_VECTOR (2 downto 0) := "011";
    constant WALK_END    : STD_LOGIC_VECTOR (2 downto 0) := "100";
    constant ALL_RED_2   : STD_LOGIC_VECTOR (2 downto 0) := "101";
    -- the length of each phase, in seconds
    constant CARS_S   : integer := 5;                -- cars green: at least 5 s
    constant YELLOW_S : integer := 2;
    constant RED_S    : integer := 1;                -- all red: the crossing clears
    constant WALK_S   : integer := 5;
    constant END_S    : integer := 3;                -- pedestrian green blinking
    constant QUARTER  : integer := TICK / 4;         -- clock cycles in a quarter of a second

    signal timed    : STD_LOGIC_VECTOR (2 downto 0) := CARS;  -- the phase being timed
    signal cycles   : integer range 0 to QUARTER - 1 := 0;    -- clock cycles in this quarter
    signal quarters : integer range 0 to 3 := 0;              -- quarters in this second
    signal seconds  : integer range 0 to 7 := 0;              -- whole seconds of this phase
    -- the counts in this clock cycle (0 in the first clock cycle of a phase)
    signal cyc  : integer range 0 to QUARTER - 1;
    signal qtr  : integer range 0 to 3;
    signal secs : integer range 0 to 7;
    signal len  : integer range 0 to 7;                       -- the length of this phase
    signal last : STD_LOGIC;                                  -- the last clock cycle of a second
begin
    cyc  <= 0 when phase /= timed else cycles;
    qtr  <= 0 when phase /= timed else quarters;
    secs <= 0 when phase /= timed else seconds;
    last <= '1' when cyc = QUARTER - 1 and qtr = 3 else '0';

    with phase select len <=
        CARS_S   when CARS,
        YELLOW_S when CARS_YELLOW,
        RED_S    when ALL_RED,
        WALK_S   when WALK,
        END_S    when WALK_END,
        RED_S    when ALL_RED_2,
        0        when others;                         -- NIGHT: no end

    process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                timed    <= CARS;
                cycles   <= 0;
                quarters <= 0;
                seconds  <= 0;
            else
                timed    <= phase;
                cycles   <= cyc;
                quarters <= qtr;
                seconds  <= secs;
                if cyc /= QUARTER - 1 then
                    cycles <= cyc + 1;
                else                                  -- a quarter of a second more
                    cycles <= 0;
                    if qtr /= 3 then
                        quarters <= qtr + 1;
                    else                              -- a second more
                        quarters <= 0;
                        if secs < len then            -- (CARS: stays at its length)
                            seconds <= secs + 1;
                        end if;
                    end if;
                end if;
            end if;
        end if;
    end process;

    done  <= '1' when secs >= len or (secs + 1 = len and last = '1') else '0';
    blink <= '1' when qtr = 0 or qtr = 2 else '0';
    left  <= std_logic_vector(to_unsigned(WALK_S + END_S - secs, 4)) when phase = WALK else
             std_logic_vector(to_unsigned(END_S - secs, 4))          when phase = WALK_END else
             "0000";
end Behavioral;
