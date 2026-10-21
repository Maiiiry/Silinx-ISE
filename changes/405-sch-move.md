In detail:

- **mountSchEditor split, fourth part: moving and dragging a wire's segment in web/js/sch-move.js (#405):** the
  schematic editor's drags that change the drawing (the selection moved with its wires stretched, one segment of a
  wire dragged) move from mountSchEditor to mountMove(ctx), called at the same point of the mount, and the geometry of a
  wire (keptEnds, rubber) to plain functions; no change in behaviour. Tests: `test/web-sch-move.test.js`, on real
  documents against their geometry and connectivity.
