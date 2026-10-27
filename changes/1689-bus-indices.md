In short:

- **Buses named with their indices:** a bus named `d(7:4)` in a schematic is `d(7:4)`: its taps take its bits by
  their indices (`d(7)` is its most significant bit), as in ISE.

In detail:

- **A bus named with its indices, not from 0 (#1689):** declared with them (`std_logic_vector(7 downto 4)`,
  `wire [7:4]`; it was `(3 downto 0)`, so a tap of `d(7)` was out of range); the ISE export names it `d(7:4)` and the
  import keeps an ISE bus's indices (an I/O marker's bus, and an ascending one, from 0 as before).
