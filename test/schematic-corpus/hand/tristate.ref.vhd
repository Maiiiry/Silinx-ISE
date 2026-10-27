library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
-- The reference of tristate.sch.json (the schematic corpus, #1687): BUFE drives when E = 1, BUFT when T = 0.
entity tristate is
  port (a, b, ea, tb : in std_logic; y : out std_logic; u : in std_logic_vector(1 downto 0); z : out std_logic_vector(1 downto 0));
end tristate;
architecture ref of tristate is
begin
  y <= a when ea = '1' else 'Z';
  y <= b when tb = '0' else 'Z';
  z <= u when ea = '1' else "ZZ";
end ref;
