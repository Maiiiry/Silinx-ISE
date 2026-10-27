library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of the ISE fixture Mux4to1b4.sch (the schematic corpus, #1687): a 4:1 multiplexer of 4-bit buses.
entity Mux4to1b4 is
  port (s : in std_logic_vector(1 downto 0); I0, I1, I2, I3 : in std_logic_vector(3 downto 0); o : out std_logic_vector(3 downto 0));
end Mux4to1b4;
architecture ref of Mux4to1b4 is
begin
  with s select o <= I0 when "00", I1 when "01", I2 when "10", I3 when others;
end ref;
