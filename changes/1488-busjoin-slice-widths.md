In short:

- Schematic editor: the bus join and the bus tap show their width on their pins, as every other symbol.

In detail:

- Schematic editor: the bus join (BUSJOIN) showed no width and the bus tap (SLICE) only its bus's range (A(7:4)). The
  join now draws the width of each input wider than a bit and of its output, the tap the width of its output when
  wider than a bit, on the pin's lead in the style of the other symbols (its input takes its bus's). The tap's range,
  which lay on the bus turned 90° or 180°, is drawn above the bus, or beside it when turned 90° / 270° (#1488).
