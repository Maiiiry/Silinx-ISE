-- Board test (#897): DDR input registers (IDDR2, their set / reset used) on pads whose neighbour's features held some of
-- their bits, each pad alone, its neighbour unused. #96 / #759 solved the registers' bits from designs that registered the
-- two pads together: A3's set / reset and second flip-flop bits had gone to B3, C9's delay bit to E9, B9's, C15's and
-- D13's second flip-flop bits to D9, A16 and E12. d(4:0) through the IDDR2s (R on d(0), d(2), d(4), S on d(1), d(3),
-- from rst), their parity on LD0.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic;
        rst : in std_logic;
        d   : in std_logic_vector(4 downto 0);
        led : out std_logic);
end top;

architecture rtl of top is
  signal ck, ckn : std_logic;
  signal q0, q1 : std_logic_vector(4 downto 0);
  signal p : std_logic := '0';
begin
  u_b : BUFG port map (I => clk, O => ck);
  ckn <= not ck;
  g : for k in 0 to 4 generate
    r : if k mod 2 = 0 generate
      u_i : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '0', INIT_Q1 => '0', SRTYPE => "SYNC")
        port map (D => d(k), C0 => ck, C1 => ckn, CE => '1', R => rst, S => '0', Q0 => q0(k), Q1 => q1(k));
    end generate;
    s : if k mod 2 = 1 generate
      u_i : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '1', INIT_Q1 => '1', SRTYPE => "SYNC")
        port map (D => d(k), C0 => ck, C1 => ckn, CE => '1', R => '0', S => rst, Q0 => q0(k), Q1 => q1(k));
    end generate;
  end generate;
  process (ck) begin
    if rising_edge(ck) then
      p <= q0(0) xor q1(0) xor q0(1) xor q1(1) xor q0(2) xor q1(2) xor q0(3) xor q1(3) xor q0(4) xor q1(4);
    end if;
  end process;
  led <= p;
end rtl;
