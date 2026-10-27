In detail:

- **A slice against its vector's direction is an error (#1692):** VHDL `a(1 to 2)` of a `(3 downto 0)` and Verilog
  `a[1:2]` of a `[3:0]` (and the reverse of ascending vectors) were taken silently, simulated as the slice the other
  way round; XST refuses them. A VHDL null slice is still allowed.
