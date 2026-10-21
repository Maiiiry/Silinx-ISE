-- Open-flow test (#96): the IOBs' DDR registers on the 50 MHz clock (B8) and its inverse. Two IDDR2 (sw(0): a clock
-- enable and a synchronous reset, INIT_Q1 = 1; sw(1): an asynchronous set) and three ODDR2 (led(0): a clock enable
-- and a synchronous reset; led(1): an asynchronous set, INIT = 1; led(2): no set / reset), their data from the IDDR2s
-- and the switches; led(3) the four captured bits through the fabric.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(3 downto 0);
        btn : in  std_logic_vector(1 downto 0);
        led : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal ck, ckn : std_logic;
  signal q0, q1 : std_logic_vector(1 downto 0);
  signal d0 : std_logic;
begin
  u_b : BUFG port map (I => clk, O => ck);
  ckn <= not ck;
  u_i0 : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '0', INIT_Q1 => '1', SRTYPE => "SYNC")
    port map (D => sw(0), C0 => ck, C1 => ckn, CE => btn(0), R => btn(1), S => '0', Q0 => q0(0), Q1 => q1(0));
  u_i1 : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '0', INIT_Q1 => '0', SRTYPE => "ASYNC")
    port map (D => sw(1), C0 => ck, C1 => ckn, CE => '1', R => '0', S => btn(1), Q0 => q0(1), Q1 => q1(1));
  d0 <= q0(0) xor q1(1);
  u_o0 : ODDR2 generic map (DDR_ALIGNMENT => "NONE", INIT => '0', SRTYPE => "SYNC")
    port map (D0 => d0, D1 => q1(0), C0 => ck, C1 => ckn, CE => btn(0), R => btn(1), S => '0', Q => led(0));
  u_o1 : ODDR2 generic map (DDR_ALIGNMENT => "NONE", INIT => '1', SRTYPE => "ASYNC")
    port map (D0 => q0(1), D1 => sw(2), C0 => ck, C1 => ckn, CE => '1', R => '0', S => btn(1), Q => led(1));
  u_o2 : ODDR2 generic map (DDR_ALIGNMENT => "NONE", INIT => '0', SRTYPE => "SYNC")
    port map (D0 => sw(3), D1 => q1(1), C0 => ck, C1 => ckn, CE => '1', R => '0', S => '0', Q => led(2));
  led(3) <= q0(0) xor q1(0) xor q0(1) xor q1(1);
end rtl;
