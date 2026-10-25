In short:

- The editor's Find button (and the toolbar's) closes the find bar when clicked again.

In detail:

- **Find toggles (#1328):** web/js/editor.js (findToggle: the search panel closed when open), web/js/app.js (the
  editor bar's Find), web/js/menus.js (the toolbar's); Ctrl+F and the menus' Find… still open it. Test:
  test/ui/editing.test.js.
