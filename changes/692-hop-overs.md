In short:

- **Hop-overs in the schematic editor:** an option draws a small arc where two wires cross without
  connecting, so a crossing no longer looks like a connection; real connections keep their junction dot.

In detail:

- **Hop-overs (#692):** the schematic toolbar's Hop-overs checkbox (off by default, remembered) draws the
  horizontal segment of a crossing with a small arc over the vertical one, where the two cross inside both
  (`wireCrossings`, core/schdoc.js); not at a T-junction, a bend or a wire's end. A view only: the document,
  its nets and its HDL do not change. In Portuguese, "Saltos".
