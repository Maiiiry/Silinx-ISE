-- A small 8-bit accumulator machine, in the style of a first digital-systems course project: a
-- control unit (a state machine of 40 states, binary encoded, that decodes a 5-bit opcode into
-- micro-steps: register moves, ALU operations, multiplication and division by repeated addition /
-- subtraction) and a data path (four 8-bit registers, an ALU behind a priority encoder, flags),
-- with a multiplexed 4-digit seven-segment display. Its control decoding (wide multiplexers of the
-- state and opcode bits) is what made Yosys's netlists of such designs large: the size budgets of
-- test/synth-quality.test.js.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk      : in  std_logic;
        rst      : in  std_logic;
        exec     : in  std_logic;
        sel      : in  std_logic;
        opcode   : in  std_logic_vector(4 downto 0);
        din      : in  std_logic_vector(7 downto 0);
        ready    : out std_logic;
        state_id : out std_logic_vector(5 downto 0);
        flags    : out std_logic_vector(3 downto 0);
        seg      : out std_logic_vector(6 downto 0);
        an       : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  type state_t is (IDLE, FETCH, DECODE, DONE,
                   CLR_R0, CLR_R1, CLR_A0, CLR_A1, LD_R0, LD_R1, SHR_A1, SHL_A1,
                   A0_R0, A0_R1, A1_R0, A1_R1, R0_A0, R1_A0, R0_A1, R1_A1,
                   INC_A0, DEC_A0, AND_A1, OR_A1, NOT_A1, XOR_A1, ADD_R0, ADD_R1, SUB_R0, SUB_R1,
                   SWAP1, SWAP2, SWAP3, MUL_INIT, MUL_TEST, MUL_ADD, MUL_DEC, MUL_END,
                   DIV_INIT, DIV_TEST, DIV_SUB, DIV_END);
  signal state, nstate : state_t := IDLE;

  -- control signals
  signal clr_r0_s, clr_r1_s, clr_a0_s, clr_a1_s : std_logic;
  signal ld_r0_s, ld_r1_s, ld_a0_s, ld_a1_s : std_logic;
  signal shr_s, shl_s, in_sel, mem_sel, alu_sel : std_logic;
  signal op_and, op_or, op_not, op_xor, op_add, op_sub, op_inc, op_dec : std_logic;

  -- data path
  signal r0, r1, a0, a1 : unsigned(7 downto 0) := (others => '0');
  signal x, y, alu, to_regs : unsigned(7 downto 0);
  signal code : std_logic_vector(3 downto 0);
  signal z0, z1, lt : std_logic;

  -- display
  signal refresh : unsigned(15 downto 0) := (others => '0');
  signal nibble : unsigned(3 downto 0);
begin
  -- ---------------------------------------------------------------- control unit
  process (clk, rst)
  begin
    if rst = '1' then
      state <= IDLE;
    elsif rising_edge(clk) then
      state <= nstate;
    end if;
  end process;

  process (state, exec, opcode, z0, lt)
  begin
    nstate <= state;
    case state is
      when IDLE   => nstate <= FETCH;
      when FETCH  => if exec = '1' then nstate <= DECODE; end if;
      when DECODE =>
        case opcode is
          when "00000" => nstate <= DONE;
          when "00001" => nstate <= CLR_R0;
          when "00010" => nstate <= CLR_R1;
          when "00011" => nstate <= CLR_A0;
          when "00100" => nstate <= CLR_A1;
          when "00101" => nstate <= LD_R0;
          when "00110" => nstate <= LD_R1;
          when "00111" => nstate <= SHR_A1;
          when "01000" => nstate <= SHL_A1;
          when "01001" => nstate <= A0_R0;
          when "01010" => nstate <= A0_R1;
          when "01011" => nstate <= A1_R0;
          when "01100" => nstate <= A1_R1;
          when "01101" => nstate <= R0_A0;
          when "01110" => nstate <= R1_A0;
          when "01111" => nstate <= R0_A1;
          when "10000" => nstate <= R1_A1;
          when "10001" => nstate <= INC_A0;
          when "10010" => nstate <= DEC_A0;
          when "10011" => nstate <= AND_A1;
          when "10100" => nstate <= OR_A1;
          when "10101" => nstate <= NOT_A1;
          when "10110" => nstate <= XOR_A1;
          when "10111" => nstate <= ADD_R0;
          when "11000" => nstate <= ADD_R1;
          when "11001" => nstate <= SUB_R0;
          when "11010" => nstate <= SUB_R1;
          when "11011" => nstate <= SWAP1;
          when "11100" => nstate <= MUL_INIT;
          when "11101" => nstate <= DIV_INIT;
          when others  => nstate <= DONE;
        end case;
      when DONE     => if exec = '0' then nstate <= FETCH; end if;
      when SWAP1    => nstate <= SWAP2;
      when SWAP2    => nstate <= SWAP3;
      when MUL_INIT => nstate <= MUL_TEST;
      when MUL_TEST => if z0 = '1' then nstate <= MUL_END; else nstate <= MUL_ADD; end if;
      when MUL_ADD  => nstate <= MUL_DEC;
      when MUL_DEC  => nstate <= MUL_TEST;
      when DIV_INIT => nstate <= DIV_TEST;
      when DIV_TEST => if lt = '1' then nstate <= DIV_END; else nstate <= DIV_SUB; end if;
      when DIV_SUB  => nstate <= DIV_TEST;
      when others   => nstate <= DONE;
    end case;
  end process;

  -- Moore outputs
  process (state)
  begin
    clr_r0_s <= '0'; clr_r1_s <= '0'; clr_a0_s <= '0'; clr_a1_s <= '0';
    ld_r0_s <= '0'; ld_r1_s <= '0'; ld_a0_s <= '0'; ld_a1_s <= '0';
    shr_s <= '0'; shl_s <= '0'; in_sel <= '0'; mem_sel <= '0'; alu_sel <= '0';
    op_and <= '0'; op_or <= '0'; op_not <= '0'; op_xor <= '0';
    op_add <= '0'; op_sub <= '0'; op_inc <= '0'; op_dec <= '0';
    ready <= '0';
    case state is
      when IDLE     => clr_r0_s <= '1'; clr_r1_s <= '1'; clr_a0_s <= '1'; clr_a1_s <= '1';
      when DONE     => ready <= '1';
      when CLR_R0   => clr_r0_s <= '1';
      when CLR_R1   => clr_r1_s <= '1';
      when CLR_A0   => clr_a0_s <= '1';
      when CLR_A1   => clr_a1_s <= '1';
      when LD_R0    => in_sel <= '1'; ld_r0_s <= '1';
      when LD_R1    => in_sel <= '1'; ld_r1_s <= '1';
      when SHR_A1   => shr_s <= '1';
      when SHL_A1   => shl_s <= '1';
      when A0_R0    => ld_a0_s <= '1';
      when A0_R1    => mem_sel <= '1'; ld_a0_s <= '1';
      when A1_R0    => ld_a1_s <= '1';
      when A1_R1    => mem_sel <= '1'; ld_a1_s <= '1';
      when R0_A0    => ld_r0_s <= '1';
      when R1_A0    => ld_r1_s <= '1';
      when R0_A1    => alu_sel <= '1'; ld_r0_s <= '1';
      when R1_A1    => alu_sel <= '1'; ld_r1_s <= '1';
      when INC_A0   => op_inc <= '1'; ld_a0_s <= '1';
      when DEC_A0   => op_dec <= '1'; ld_a0_s <= '1';
      when AND_A1   => alu_sel <= '1'; mem_sel <= '1'; op_and <= '1'; ld_a1_s <= '1';
      when OR_A1    => alu_sel <= '1'; mem_sel <= '1'; op_or <= '1'; ld_a1_s <= '1';
      when NOT_A1   => alu_sel <= '1'; op_not <= '1'; ld_a1_s <= '1';
      when XOR_A1   => alu_sel <= '1'; mem_sel <= '1'; op_xor <= '1'; ld_a1_s <= '1';
      when ADD_R0   => alu_sel <= '1'; op_add <= '1'; ld_a1_s <= '1';
      when ADD_R1   => alu_sel <= '1'; mem_sel <= '1'; op_add <= '1'; ld_a1_s <= '1';
      when SUB_R0   => alu_sel <= '1'; op_sub <= '1'; ld_a1_s <= '1';
      when SUB_R1   => alu_sel <= '1'; mem_sel <= '1'; op_sub <= '1'; ld_a1_s <= '1';
      when SWAP1    => ld_a0_s <= '1';
      when SWAP2    => mem_sel <= '1'; ld_a1_s <= '1';
      when SWAP3    => alu_sel <= '1'; ld_r0_s <= '1';
      when MUL_INIT => clr_a1_s <= '1'; mem_sel <= '1'; ld_a0_s <= '1';
      when MUL_ADD  => alu_sel <= '1'; op_add <= '1'; ld_a1_s <= '1';
      when MUL_DEC  => op_dec <= '1'; ld_a0_s <= '1';
      when MUL_END  => alu_sel <= '1'; ld_r0_s <= '1';
      when DIV_INIT => ld_a1_s <= '1'; clr_a0_s <= '1';
      when DIV_SUB  => alu_sel <= '1'; mem_sel <= '1'; op_sub <= '1'; ld_a1_s <= '1';
      when DIV_END  => ld_r0_s <= '1';
      when others   => null;
    end case;
  end process;

  state_id <= std_logic_vector(to_unsigned(state_t'pos(state), 6));

  -- ---------------------------------------------------------------- data path
  x <= a1 when alu_sel = '1' else a0;
  y <= r1 when mem_sel = '1' else r0;
  to_regs <= unsigned(din) when in_sel = '1' else x;

  code <= "0001" when op_and = '1' else
          "0010" when op_or = '1' else
          "0011" when op_not = '1' else
          "0100" when op_xor = '1' else
          "0101" when op_add = '1' else
          "0110" when op_sub = '1' else
          "0111" when op_inc = '1' else
          "1000" when op_dec = '1' else
          "0000";

  process (code, x, y)
  begin
    case code is
      when "0001" => alu <= x and y;
      when "0010" => alu <= x or y;
      when "0011" => alu <= not x;
      when "0100" => alu <= x xor y;
      when "0101" => alu <= x + y;
      when "0110" => alu <= x - y;
      when "0111" => alu <= x + 1;
      when "1000" => alu <= x - 1;
      when others => alu <= y;
    end case;
  end process;

  process (clk)
  begin
    if rising_edge(clk) then
      if clr_r0_s = '1' then r0 <= (others => '0'); elsif ld_r0_s = '1' then r0 <= to_regs; end if;
      if clr_r1_s = '1' then r1 <= (others => '0'); elsif ld_r1_s = '1' then r1 <= to_regs; end if;
      if clr_a0_s = '1' then a0 <= (others => '0'); elsif ld_a0_s = '1' then a0 <= alu; end if;
      if clr_a1_s = '1' then a1 <= (others => '0');
      elsif ld_a1_s = '1' then a1 <= alu;
      elsif shr_s = '1' then a1 <= '0' & a1(7 downto 1);
      elsif shl_s = '1' then a1 <= a1(6 downto 0) & '0';
      end if;
    end if;
  end process;

  z0 <= '1' when a0 = 0 else '0';
  z1 <= '1' when a1 = 0 else '0';
  lt <= '1' when a1 < r1 else '0';
  flags <= z0 & z1 & lt & a1(7);

  -- ---------------------------------------------------------------- display
  process (clk)
  begin
    if rising_edge(clk) then
      refresh <= refresh + 1;
    end if;
  end process;

  process (refresh, sel, r0, r1, a0, a1)
  begin
    case refresh(15 downto 14) is
      when "00"   => an <= "1110"; if sel = '0' then nibble <= a0(3 downto 0); else nibble <= a1(3 downto 0); end if;
      when "01"   => an <= "1101"; if sel = '0' then nibble <= a0(7 downto 4); else nibble <= a1(7 downto 4); end if;
      when "10"   => an <= "1011"; if sel = '0' then nibble <= r0(3 downto 0); else nibble <= r1(3 downto 0); end if;
      when others => an <= "0111"; if sel = '0' then nibble <= r0(7 downto 4); else nibble <= r1(7 downto 4); end if;
    end case;
  end process;

  with nibble select
    seg <= "1000000" when "0000", "1111001" when "0001", "0100100" when "0010", "0110000" when "0011",
           "0011001" when "0100", "0010010" when "0101", "0000010" when "0110", "1111000" when "0111",
           "0000000" when "1000", "0010000" when "1001", "0001000" when "1010", "0000011" when "1011",
           "1000110" when "1100", "0100001" when "1101", "0000110" when "1110", "0001110" when others;
end rtl;
