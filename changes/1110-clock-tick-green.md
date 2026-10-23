In short:

- **Schematic Try it: the clock's tick seen:** a click on a clock's I/O marker (one cycle) turns it green for a moment;
  it stays green while the clock runs.

In detail:

- **A clock marker ticked (#1110):** one cycle left the marker at its level (0), so nothing showed the click. It is
  green TICK_MS (300 ms) after a click, and while the clock runs (web/js/sch-live.js, sch-live-inputs.js,
  sch-editor.css); back to its level after, or on Pause.
