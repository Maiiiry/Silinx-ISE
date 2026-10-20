In short:

- **Cut, Copy, Paste and Delete everywhere:** Edit ▸ Cut / Copy / Paste / Delete (Ctrl+X, C, V, Del) and the
  toolbar's buttons work in the text editors and in the schematic editor; a schematic's parts are pasted next
  to the original, selected, with new names, also into another schematic or another project.

In detail:

- **Edit ▸ Cut / Copy / Paste / Delete and the toolbar dispatched to the active editor (#677):** as Undo / Redo
  are; disabled when there is nothing to copy or paste; the modern interface shows the toolbar's Cut / Copy /
  Paste too. Through the system clipboard where the browser allows it, else a clipboard of the app's own
  (file://, a permission refused).
- **The schematic's Cut / Copy / Paste (#677, core/schclip.js):** the selected parts, wires, net names and I/O
  markers, with the wires joining the copied parts (not those leading to parts left behind); pasted offset and
  selected, an instance name already used gets the next inst_n, a marker's or a net's name already used gets
  _1, _2… (a net name of a marker of the sheet is kept: the copy joins that port). Ctrl+V reads the system
  clipboard, so a copy made in another tab pastes too.
