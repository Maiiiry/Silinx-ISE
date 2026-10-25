In short:

- The modern interface has no File and Edit menus: their commands are on the Start page, the toolbar, the editors and
  the command palette. The classic interface keeps them.

In detail:

- **No File and Edit menus in the modern interface (#1307):** web/css/tasks.css (hidden by their names, as #1217's and
  #1253's). Tests: test/ui/app.test.js (the menu bar, in English and Portuguese; the menu walk); the tests of the File and Edit menus themselves (hints, projects, standalone) in the classic interface.
