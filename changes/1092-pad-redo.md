In short:

- **Redo on the handwriting pad:** Undo takes back the last stroke or a Clear, Redo does it again (Ctrl+Z, Ctrl+Y
  too), in the three handwriting dialogs.

In detail:

- **The handwriting pad's Undo and Redo (#1092):** the pad keeps what was done (a stroke, a Clear) and what was
  undone; Undo takes back the last of them (a Clear: the drawing comes back), Redo does it again, a new stroke ends
  what can be redone. `padButtons` (`web/js/ink-pad.js`) gives the three dialogs their Undo, Redo and Clear, disabled
  when there is nothing to do, and Ctrl/Cmd+Z, Ctrl+Y and Ctrl/Cmd+Shift+Z outside their text fields.
