In short:

- **Bus widths on the symbols' leads:** a bus pin's width is written on its lead, the lead broken under it, in every
  orientation (as it was only on a lead up or down).

In detail:

- **The width on its lead (#1174):** web/js/sch-svg.js pinWidth, every side; test/web-sch-svg.test.js checks each
  width on its own lead, every symbol in its 8 orientations.
