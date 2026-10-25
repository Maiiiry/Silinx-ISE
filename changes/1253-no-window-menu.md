In short:

- The modern interface has no Window menu: the documents' tabs list and switch the open documents, and their
  right-click menu closes them. The classic interface keeps it.

In detail:

- **No Window menu in the modern interface (#1253):** web/css/tasks.css (hidden by its name, as #1217's menus). Test:
  test/ui/app.test.js (the menu bar, in English and Portuguese; the menu walk).
