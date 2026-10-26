In short:

- Beautify in the schematic editor now lays out the whole schematic when nothing is selected: the inputs on the
  left, the outputs on the right, the symbols in the order of the signals, then the wires. The connections stay the
  same; with a selection it still draws only the selected wires again.

In detail:

- **Beautify lays out the whole sheet (#1506):** with nothing selected, the schematic is laid out again as Convert to
  Schematic lays one out (`core/schdoc-place.js`: ELK's layered layout, the input markers first and the output
  markers last, or its columns without ELK), fed with the drawing's own nets; the symbols are turned upright, the
  wires routed and then made clearer (#1481), and a net name the placer does not draw (a second name, a name on a
  marker's net) is put back on its net. The new drawing is taken only when it means the same (the same nets, names,
  pins and markers, the same diagnostics, the same VHDL and Verilog) and no two symbols overlap; otherwise only the
  wires are drawn again. One undo step (ELK lays it out on a copy; an edit made meanwhile cancels it). With a
  selection Beautify draws the selected wires again, as before. Tested on every example's modules (with ELK, with
  the columns, and from HDL without a layout), the gates schematic, the truth tables' schematics and ISE's
  schematics (`core/schbeautify-sheet.js`).
