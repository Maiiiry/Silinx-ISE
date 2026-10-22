In short:

- **Schematic wires no longer overlap:** a wire drawn along another wire, over a pin or a marker, or through a symbol
  is nudged a step aside onto a clear path; a symbol moved or pasted onto a wire has that wire routed around it; the
  schematics made from HDL draw their nets with wires where they used to fall back to labelled stubs. Only the drawn
  paths change: the wires' ends, the nets and the generated HDL stay the same.

In detail:

- **Wire paths that avoid overlaps (#948):** `core/schpath.js` holds the grid of what a path must keep clear of and an
  orthogonal A* router on it. A path never runs along another wire's segment, never passes over a pin, an I/O marker,
  a net name or another wire's end or bend, never enters a symbol's or a marker's body, and bends only on a free
  point; it may cross a wire at a right angle (a hop-over, #756). Among the clear paths it prefers few bends and
  crossings, leaves and enters a pin or a marker by its side, and keeps a grid step from parallel wires and from the
  bodies. `wireClashes(doc)` lists what a drawing breaks of these rules. A wire drawn by hand (Add Wire) is kept as
  drawn when it is clear, otherwise routed between its ends along the drawn path, leaving it only where it must
  (`nudgeWire`). After a move or a paste, the wires with a clash the drawing did not have before are routed again
  (`untangleNew`; old clashes elsewhere stay as drawn); the wires re-routed after a move use the same router
  (`core/schroute.js`). A schematic made from HDL has its overlapping paths routed again (`untangleWires`) and puts a
  net's name on a point of its wire that no other net's wire crosses: a name at a crossing used to join the two nets,
  and the check that follows then replaced their wires by labelled stubs (in modules of six of the seven examples).
  A wire keeps its id and its two ends, so the netlist and the generated VHDL and Verilog are unchanged (#754's rule,
  a wire never joins two named nets, stays). Tests: `test/schpath.test.js` (the router, the nudge, the examples' and the
  generated schematics, moves), `test/ui/sch-wires.test.js`.
