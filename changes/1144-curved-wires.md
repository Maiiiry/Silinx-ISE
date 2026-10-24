In short:

- **Curved wires in the schematic editor:** a toolbar checkbox, Curved wires, draws a schematic's wires as smooth
  curves of any shape instead of the technical drawing's square corners. A wire drawn by clicks passes through the
  points clicked, a stroke keeps its shape, and the selected wire's handles (or the wire itself) are dragged to
  reshape it, by the mouse or a finger. The connections, the nets, Check Schematic and the generated HDL are the same
  either way; unticked, the technical drawing is back and the curves are kept.

In detail:

- **Curved wires (#1144):** the schematic's `wireStyle: "curved"` (saved with it, undone by Undo), the checkbox in the
  editor's toolbar after Keep connections (Fios curvos in Portuguese). Every wire keeps its rectilinear path
  (`points`), from which its connections, net, HDL and ISE `.sch` come as before; a wire's own curve (`curve`: its
  knots, each stored relative to the wire's two ends, so that it follows them when a symbol moves, a selection is
  pasted or a wire is rerouted or split) is a drawing only, a Catmull-Rom spline through its knots
  (core/schcurve.js); a wire without one is drawn as its rectilinear path with its bends rounded. In curved mode: a
  wire by clicks keeps the points clicked and a stroke (#1052) its simplified shape, their rectilinear path routed
  between their ends (#948); a wire ended on a curve, a net name or an I/O marker put on one connects at the point of
  the path answering it; the selected wire's handles dragged, its curve grabbed and pulled (a knot added), a handle
  removed by a double click, Reset curve in its Properties; net and bus names on the curves; hop-overs on the
  curves (#1163), junction dots as before; printed as drawn. The short of two named nets is refused as before
  (#754, #806). Older files open as they were (the technical drawing).
