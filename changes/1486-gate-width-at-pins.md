In short:

- Schematic editor: a gate wider than one bit (AND, OR, XOR, INV, BUF, BUFE, BUFT…) shows its width at its input and
  output pins, as the other symbols do, no longer inside its shape.

In detail:

- Schematic editor: the gates (AND … XNOR and their inverted-input forms, INV, BUF, BUFE / BUFT) wider than one bit
  drew their width inside the gate's shape. They now draw it on each bus pin's lead, in the style and place of the
  other symbols' widths (multiplexers, adders, constants); an inverted input's in the middle of its lead, clear of its
  bubble. The same in the printed SVG and the dark theme; a one-bit gate shows none (#1486).
