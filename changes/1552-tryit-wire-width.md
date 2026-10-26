In short:

- **Schematic Try it: wires keep their width:** a single-bit wire is no longer drawn thick while the schematic is
  tried, so it is not confused with a bus; its colour still shows its value.

In detail:

- **Try it: a single-bit wire keeps its width (#1552):** the live simulation's wires were all drawn wider (2 instead
  of 1.3), so a single-bit wire looked like a bus. Now only the colour follows the value (0, 1, X, Z) and only a bus
  is thick, as outside Try it (`web/css/sch-editor.css`).
