In short:

- **Paste where you point:** in a schematic, Ctrl+V with the mouse on the sheet puts the copy at the pointer; Edit ▸
  Paste (or the mouse off the sheet) puts it in a blank place of the part of the sheet in view.

In detail:

- **Schematic: a paste at the mouse, or in a blank place in view (#1797):** the copy is centred on the mouse
  pointer when it is on the sheet; else it goes in the blank place of the visible part of the sheet nearest to its
  centre, clear of the symbols, wires, markers and net names there (centred in view when none is blank), instead of
  40 px from the original or where it was in another schematic. `core/schclip.js` `pasteOffset`.
