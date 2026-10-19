In detail:

- **app.js split by concern, ninth part: renaming (#405):** Rename Symbol (F2) in an HDL editor and renaming a source
  (its file and / or the module it defines, with the instances, the drawings' links and the constraints updated)
  move from `web/js/app.js` to `web/js/rename.js` (about 150 lines), with no change in behaviour.
  `test/app-modules.test.js` checks the new module.
