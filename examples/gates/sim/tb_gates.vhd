----------------------------------------------------------------------------------
-- Test bench for gates: the 4-bit prime-number detector drawn as a schematic
-- (src/gates.sch.json, its VHDL src/gates.vhd kept in sync with it).
--
-- F(A,B,C,D) = 1 when the number ABCD (A the MSB) is prime: 2, 3, 5, 7, 11 or 13,
-- i.e. the minterms m(2, 3, 5, 7, 11, 13); F = A'B'C + A'BD + BC'D + B'CD.
-- On the board the switches SW3..SW0 are A..D (sw(3) = A ... sw(0) = D):
--   led(0) (LD0) = prime_sop,  the AND-OR circuit (NOT, AND and OR gates)
--   led(1) (LD1) = prime_nand, the same function with NAND gates only
--
-- The test applies all 16 input combinations (0 to 15) and compares both outputs
-- with the expected value (a table of the primes below 16). Each mismatch is
-- reported as an ERROR; when all of them pass: "Simulation finished OK".
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY tb_gates IS
END tb_gates;

ARCHITECTURE behavior OF tb_gates IS
   signal sw  : std_logic_vector(3 downto 0) := "0000";
   signal led : std_logic_vector(1 downto 0);
   -- the expected output for each number 0..15: '1' for the primes 2, 3, 5, 7, 11, 13
   constant PRIME : std_logic_vector(0 to 15) := "0011010100010100";
BEGIN
   uut: entity work.gates
      port map ( sw => sw, led => led );

   stim_proc: process
      variable errors : integer := 0;
   begin
      for n in 0 to 15 loop
         sw <= std_logic_vector(to_unsigned(n, 4));   -- ABCD = n
         wait for 10 ns;                              -- combinational logic: let it settle
         if led(0) /= PRIME(n) then
            report "ERROR: prime_sop (LD0) for " & integer'image(n) & " is " & std_logic'image(led(0))
                 & ", expected " & std_logic'image(PRIME(n)) severity error;
            errors := errors + 1;
         end if;
         if led(1) /= PRIME(n) then
            report "ERROR: prime_nand (LD1) for " & integer'image(n) & " is " & std_logic'image(led(1))
                 & ", expected " & std_logic'image(PRIME(n)) severity error;
            errors := errors + 1;
         end if;
      end loop;
      if errors = 0 then
         report "Simulation finished OK" severity note;
      else
         report "ERROR: " & integer'image(errors) & " wrong output(s)" severity error;
      end if;
      wait;
   end process;
END;
