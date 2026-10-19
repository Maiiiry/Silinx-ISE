In detail:

- **app.js split by concern, sixth part: the Design pane (#405):** the hierarchy of the sources, its selection and keys,
  the context menus of the project, its modules and files, Set as Top Module, removing a source and the project's
  settings saved one at a time move from `web/js/app.js` to `web/js/design.js` (about 330 lines), with no change in
  behaviour; `app.js` drops the imports only the moved code used (and an unused one, `buildSchematic`).
  `test/app-modules.test.js` checks the new module.
