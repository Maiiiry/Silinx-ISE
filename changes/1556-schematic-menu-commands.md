In short:

- **Schematic: Duplicate, Rotate, Mirror and Delete on a right-click:** a symbol's (an I/O marker's) right-click
  menu has them next to Rename…, for the symbol or the whole selection.

In detail:

- **The schematic editor's right-click menu: Duplicate, Rotate, Mirror, Delete (#1556):** next to Rename… (#1546), with
  their shortcuts (Ctrl+R, Ctrl+M, Del), in `web/js/sch-context.js`. They act on the selection when the object clicked
  is part of it, else on that object alone. Duplicate (`duplicateSel`, `web/js/sch-select.js`) copies the selected
  symbols and I/O markers without their wires, right of them, with fresh names, the copy selected. Each is one undo
  step. A net name's menu has Rename… and Delete.
