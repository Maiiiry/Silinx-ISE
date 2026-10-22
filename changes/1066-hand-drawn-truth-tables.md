In short:

- **Hand-drawn truth tables:** in the truth table editor, *Handwritten Table…* reads a whole table drawn with a pen,
  a finger or the mouse (the names, the lines, the 0, 1 and X), offline, into its text to correct, then fills the
  table.

In detail:

- **A truth table drawn by hand (#1066, stage 2 of #1055):** `core/ink/table.js` finds the ruling lines (long straight
  strokes), the rows (by their lines or their gaps; the small marks join the nearest), the columns (the cells of the
  rows below the header, aligned), reads the header's names together on their line (`recognizeWords` in
  `core/ink/expression.js`: the case by the digits' height, an i or a j by its dot) and each cell as 0, 1 or X; the
  inputs end at the only upright line across the table, or the double one of a full grid, else the last column is the
  output (a warning). The table's text (`A B | F`, a row a line) is shown to correct and read back by
  `tableFromText` (the rows in any order; a row missing, repeated or contradicted, a value not 0 / 1 / X, the names:
  warnings and errors). The Handwritten Truth Table dialog (`web/js/ink-table-dialog.js`) fills the editor's inputs,
  outputs and columns, one step of Undo. Held-out tables (`core/ink/synth-table.js`: other hands than the templates',
  with lines or a full grid) are read exactly 38 times of 40, every cell right (`test/ink-table.test.js`).
