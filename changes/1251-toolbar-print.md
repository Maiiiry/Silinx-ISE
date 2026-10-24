In short:

- The toolbar has a Print button (as File ▸ Print…, for the drawing in front), and no longer the Design Summary,
  View RTL Schematic and I/O Pin Planning buttons (the processes, the tasks and the menus have them).

In detail:

- **The toolbar's Print (#1251) and its buttons removed (#1252):** web/js/menus.js (setupToolbar: Print after Open
  Project, enabled as File ▸ Print… is, refreshed with Undo / Redo; the Design Summary, View RTL Schematic and I/O Pin
  Planning buttons removed), web/js/icons.js (the print icon), web/js/i18n.js ("Print": "Imprimir"). Test:
  test/ui/app.test.js.
