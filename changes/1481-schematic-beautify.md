In short:

- The schematic editor has a **Beautify** button: it draws the wires again so that the schematic is easier to read
  (fewer bends and crossings, none through a symbol), the selected wires or the whole sheet, in one undo step. The
  symbols and the connections stay the same.

In detail:

- **Beautify in the schematic editor (#1481):** a toolbar button (Embelezar in Portuguese) that routes the wires
  again on the editor's own grid and router (`core/schpath.js`): orthogonal paths, never through a symbol, never along
  another wire nor bending on one. The symbols, the I/O markers, the net names and every wire's ends stay; a wire
  takes a new path only when it is clear and has no more bends and no more crossings than the old one (a wire that
  broke a rule takes any clear path), so the drawing never gets worse by these measures, and if the nets were to
  change the drawing is left as it was. With a selection it works on the selected wires and the wires of the selected
  symbols and markers; without one, on the whole sheet. One undo step; hidden in a read-only view. Tested on every
  example's modules (with ELK's layout and without), the gates schematic, the truth tables' schematics and ISE's
  schematics: the same netlist and the same VHDL and Verilog (`core/schbeautify.js`, `web/js/sch-beautify.js`).
