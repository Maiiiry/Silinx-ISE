In short:

- **Schematics: I/O markers take their direction from what they connect to:** a marker wired to a symbol's output
  becomes an output, to an input an input (to a bidirectional pin, bidirectional).

In detail:

- **An I/O marker's direction from the pins an edit connects it to (#1109):** core/schdoc-markers.js compares the
  netlist before and after an edit (a wire drawn, the marker or a symbol moved): a marker whose net gained symbols'
  pins becomes an output when an output pin drives the net, bidirectional on an inout pin, else an input. It is done
  in the same edit (web/js/sch-edits.js), so one Undo reverts both; a direction set in the properties stays, since
  that edit connects no new pin.
