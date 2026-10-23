In short:

- **Schematics:** a VCC or GND wider than 1 bit is drawn with a bus stem, thick, as every other symbol's bus pins.

In detail:

- **VCC and GND as buses (#1122):** their stem is now their pin's lead (web/js/sch-svg.js), a bus when it is wider
  than 1 bit; it was part of their shape's path, always thin.
