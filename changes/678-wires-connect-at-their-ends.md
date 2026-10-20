In short:

- **Schematic wires connect only where they end:** a wire drawn across a symbol's pin, or across the end
  of another wire, no longer connects to it (no more nets with two drivers because a wire passed over a
  gate). Ending a wire on a pin, a marker or another wire, and dropping a symbol onto a wire, still connect
  there, as in ISE. Schematics saved before keep their connections.

In detail:

- **Schematic connectivity at the wires' ends (#678):** pins, I/O markers and wire ends at the same point
  connect; a wire's segments and bends do not (a pin or a wire end lying on them stays apart). A connection
  made in the middle of a wire (a wire ended on its segment or bend, a symbol or a marker dropped onto it,
  #170) splits that wire there, so the joint is an end of both (`splitWiresAt`). The documents become
  version 3: one of version 2 is converted on opening, its wires split where they connected (its nets and
  its HDL the same; with module symbols, once the modules are known). The schematics made from HDL, from a
  truth table and from ISE's `.sch` join each net's own wires only: two of their nets that merely touched no
  longer merge (an imported ISE adder's CO and OFL, a fallback layout's nets). The junction dots: three
  wire ends, or two at a pin; a named bus split at its taps still shows its name once per straight run.
