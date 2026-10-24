In short:

- **Read-only documents:** Undo and Redo greyed out (the toolbar and the Edit menu) when the document in front is
  read-only, the HDL generated from a drawing; Find and Check Syntax stay.

In detail:

- **No undo for a read-only document (#1192):** web/js/app.js docEditor none for a read-only HDL editor; the toolbar's
  Undo / Redo enabled as the Edit menu's (web/js/menus.js refreshSteps).
