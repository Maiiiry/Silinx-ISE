In short:

- **A wire drawn as a bus by its width:** a bus (more than 1 bit) is drawn thick and a 1-bit wire as a thin line,
  always. The wire's "Draw as bus" property, which could draw a 1-bit wire as a bus, is gone.

In detail:

- **Schematic: no "Draw as bus" (#1705):** a wire is drawn from its net's width alone; the "Draw as bus" box is no
  longer in a wire's properties nor in several wires' common properties. A schematic saved with the flag (an older
  one, an ISE import) opens unchanged, drawn by its width.
