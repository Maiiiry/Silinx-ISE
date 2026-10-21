In detail:

- **mountSchEditor split, third part: the drawing of the document in web/js/sch-render.js (#405):** the schematic
  editor's drawing of the sheet, wires, symbols, I/O markers, net names and unconnected pins, the overlay of the tool in
  use, the toolbar's state and the status line move from mountSchEditor to mountRender(ctx), called at the same point of
  the mount; no change in behaviour. Tests: `test/ui/sch-render.test.js`, the drawing mounted alone.
