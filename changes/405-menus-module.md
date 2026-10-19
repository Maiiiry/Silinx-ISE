In detail:

- **app.js split by concern, seventh part: the menus and the toolbar (#405):** the menu bar's menus and their commands,
  the toolbar, the command palette, printing the document in front and exporting or importing a project as a zip
  file move from `web/js/app.js` to `web/js/menus.js` (about 220 lines), with no change in behaviour; `app.js` drops
  the imports only they used. `test/app-modules.test.js` checks the new module.
